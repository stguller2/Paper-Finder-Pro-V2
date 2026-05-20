import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../middleware/logging';

const router = express.Router();

// Strict DOI regex
const DOI_REGEX = /^10\.\d{4,9}\/[^\s]+$/;

// ── Layer 1: Unpaywall (Legal Open Access) ──
const UNPAYWALL_EMAIL = 'admin@doiscan.ai';

// ── Layer 2: Sci-Hub PDF CDN (extracted from Sci-Hub mirror HTML analysis) ──
const SCIHUB_PDF_CDNS = [
  'https://sci.bban.top/pdf',
  'https://zero.sci-hub.se',
];

// ── Layer 3: Sci-Hub mirrors for HTML parsing fallback ──
const SCIHUB_MIRRORS = [
  'https://sci-hub.ee',
  'https://sci-hub.al',
  'https://sci-hub.mk',
  'https://sci-hub.vg',
  'https://sci-hub.ru',
  'https://sci-hub.st',
];

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Circuit Breaker Pattern
 * Prevents repeated attempts to failing mirrors.
 * After `threshold` failures within `windowMs`, the mirror is disabled for `cooldownMs`.
 */
interface CircuitState {
  failures: number;
  lastFailureAt: number;
  disabledUntil: number;
}

class CircuitBreaker {
  private circuits = new Map<string, CircuitState>();
  private threshold: number;
  private windowMs: number;
  private cooldownMs: number;

  constructor(threshold = 3, windowMs = 5 * 60 * 1000, cooldownMs = 5 * 60 * 1000) {
    this.threshold = threshold;
    this.windowMs = windowMs;
    this.cooldownMs = cooldownMs;
  }

  isDisabled(key: string): boolean {
    const state = this.circuits.get(key);
    if (!state) return false;
    if (Date.now() < state.disabledUntil) return true;
    // Reset if cooldown expired
    if (Date.now() > state.disabledUntil) {
      this.circuits.delete(key);
      return false;
    }
    return false;
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const state = this.circuits.get(key) || { failures: 0, lastFailureAt: 0, disabledUntil: 0 };

    // Reset failure count if outside window
    if (now - state.lastFailureAt > this.windowMs) {
      state.failures = 0;
    }

    state.failures++;
    state.lastFailureAt = now;

    if (state.failures >= this.threshold) {
      state.disabledUntil = now + this.cooldownMs;
      logger.warn({ circuit: key, failures: state.failures, cooldownSec: this.cooldownMs / 1000 }, 'Circuit breaker tripped');
    }

    this.circuits.set(key, state);
  }

  recordSuccess(key: string): void {
    this.circuits.delete(key);
  }

  get stats(): Record<string, { failures: number; disabled: boolean }> {
    const result: Record<string, { failures: number; disabled: boolean }> = {};
    for (const [key, state] of this.circuits.entries()) {
      result[key] = {
        failures: state.failures,
        disabled: Date.now() < state.disabledUntil,
      };
    }
    return result;
  }
}

const circuitBreaker = new CircuitBreaker(3, 5 * 60 * 1000, 5 * 60 * 1000);

/**
 * Layer 1: Unpaywall (legal open-access).
 * Returns the direct PDF URL or null.
 */
async function tryUnpaywall(doi: string): Promise<string | null> {
  try {
    const res = await axios.get(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${UNPAYWALL_EMAIL}`,
      { timeout: 8000 }
    );

    const pdfUrl = res.data?.best_oa_location?.url_for_pdf;
    if (pdfUrl) {
      logger.info({ doi, source: 'unpaywall' }, 'Open Access PDF found via Unpaywall');
      return pdfUrl;
    }

    const landingUrl = res.data?.best_oa_location?.url;
    if (landingUrl && landingUrl.endsWith('.pdf')) {
      return landingUrl;
    }

    return null;
  } catch (err: any) {
    logger.debug({ doi, error: err.message }, 'Unpaywall lookup failed');
    return null;
  }
}

/**
 * Layer 2: Direct Sci-Hub PDF CDN.
 */
async function trySciHubCDN(doi: string): Promise<string | null> {
  for (const cdn of SCIHUB_PDF_CDNS) {
    if (circuitBreaker.isDisabled(cdn)) {
      logger.debug({ cdn }, 'Circuit breaker open, skipping CDN');
      continue;
    }

    const pdfUrl = `${cdn}/${doi}.pdf`;
    try {
      const headRes = await axios.head(pdfUrl, {
        timeout: 6000,
        maxRedirects: 3,
        headers: { 'User-Agent': BROWSER_UA },
        validateStatus: (status) => status < 400,
      });

      const ct = String(headRes.headers['content-type'] || '');
      if (ct.includes('pdf') || ct.includes('octet-stream')) {
        logger.info({ doi, cdn, size: headRes.headers['content-length'] }, 'Sci-Hub CDN PDF found');
        circuitBreaker.recordSuccess(cdn);
        return pdfUrl;
      }
      circuitBreaker.recordFailure(cdn);
    } catch (err: any) {
      logger.debug({ doi, cdn, error: err.message }, 'CDN check failed');
      circuitBreaker.recordFailure(cdn);
    }
  }
  return null;
}

/**
 * Layer 3: Sci-Hub HTML page parsing.
 */
async function trySciHubHTML(doi: string): Promise<string | null> {
  for (const mirror of SCIHUB_MIRRORS) {
    if (circuitBreaker.isDisabled(mirror)) {
      logger.debug({ mirror }, 'Circuit breaker open, skipping mirror');
      continue;
    }

    try {
      const scihubUrl = `${mirror}/${doi}`;
      const response = await axios.get(scihubUrl, {
        timeout: 8000,
        maxRedirects: 5,
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        responseType: 'text'
      });

      const html = response.data as string;

      const contentType = String(response.headers['content-type'] || '');
      if (contentType.includes('application/pdf')) {
        circuitBreaker.recordSuccess(mirror);
        return scihubUrl;
      }

      const pdfPatterns = [
        /src=["'](https?:\/\/[^"']*\.pdf[^"']*)/i,
        /(?:iframe|embed)[^>]+src=["']([^"']+\.pdf[^"']*)/i,
        /src=["'](\/\/[^"']*\.pdf[^"']*)/i,
        /location\.href\s*=\s*["']([^"']+\.pdf[^"']*)/i,
        /id=["']pdf["'][^>]*src=["']([^"']+)/i,
      ];

      for (const pattern of pdfPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          let pdfUrl = match[1];
          pdfUrl = pdfUrl.split('#')[0];
          if (pdfUrl.startsWith('//')) {
            pdfUrl = 'https:' + pdfUrl;
          } else if (pdfUrl.startsWith('/')) {
            pdfUrl = mirror + pdfUrl;
          }

          logger.info({ doi, mirror, pdfUrl: pdfUrl.substring(0, 100) }, 'Sci-Hub PDF URL extracted from HTML');
          circuitBreaker.recordSuccess(mirror);
          return pdfUrl;
        }
      }

      if (html.includes('article not found') || html.includes('no matching proxies') || html.includes('mutual aid community')) {
        logger.debug({ doi, mirror }, 'Paper not in Sci-Hub database');
        break;
      }

      circuitBreaker.recordFailure(mirror);
      logger.debug({ doi, mirror }, 'Mirror responded but no PDF link found');
    } catch (error: any) {
      logger.debug({ doi, mirror, error: error.message }, 'Mirror failed');
      circuitBreaker.recordFailure(mirror);
    }
  }

  return null;
}

/**
 * Stream PDF from source URL to Express response.
 * Uses streaming instead of arraybuffer to avoid loading entire PDF into memory.
 * Validates magic bytes from first chunk, then pipes the rest.
 */
async function streamPdf(pdfUrl: string, doi: string, res: express.Response): Promise<boolean> {
  return new Promise<boolean>(async (resolve) => {
    let magicValidated = false;
    let responded = false;

    try {
      const pdfResponse = await axios({
        method: 'get',
        url: pdfUrl,
        timeout: 30000,
        responseType: 'stream',
        maxRedirects: 5,
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'application/pdf,*/*',
          'Referer': 'https://sci-hub.ee/',
        },
      });

      const contentType = String(pdfResponse.headers['content-type'] || '');
      if (!contentType.includes('pdf') && !contentType.includes('octet-stream') && !contentType.includes('application/')) {
        logger.debug({ pdfUrl, contentType }, 'URL did not return PDF content-type');
        return resolve(false);
      }

      let firstChunk = true;
      let errorOccurred = false;

      pdfResponse.data.on('data', (chunk: Buffer) => {
        if (firstChunk) {
          firstChunk = false;
          if (chunk.length >= 5 && chunk.toString('utf8', 0, 5) === '%PDF-') {
            magicValidated = true;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Disposition', `attachment; filename="${doi.replace(/\//g, '_')}.pdf"`);
          } else {
            errorOccurred = true;
            logger.warn({ pdfUrl, doi }, 'Downloaded stream failed magic byte validation');
            if (!responded) {
              responded = true;
              res.status(502).json({ error: 'Invalid PDF response from source' });
            }
            return;
          }
        }

        if (magicValidated && !res.writableEnded && !errorOccurred) {
          res.write(chunk);
        }
      });

      pdfResponse.data.on('end', () => {
        if (!responded) {
          responded = true;
          if (magicValidated && !res.writableEnded) {
            res.end();
          }
          resolve(magicValidated);
        }
      });

      pdfResponse.data.on('error', (err: Error) => {
        logger.debug({ pdfUrl, error: err.message }, 'Stream error during PDF download');
        if (!responded) {
          responded = true;
          if (!res.writableEnded) {
            res.status(502).json({ error: 'Download interrupted' });
          }
          resolve(false);
        }
      });

      res.on('close', () => {
        if (!responded) {
          responded = true;
          resolve(false);
        }
      });
    } catch (err: any) {
      logger.debug({ pdfUrl, error: err.message }, 'PDF download failed');
      if (!responded) {
        responded = true;
        resolve(false);
      }
    }
  });
}

// ── Main Download Endpoint ──
router.get('/download/*', async (req, res) => {
  const doi = req.params[0]?.trim();
  const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');

  logger.info({ doi, ip_hash: ipHash }, 'Download request received');

  if (!doi || !DOI_REGEX.test(doi)) {
    logger.warn({ doi, ip_hash: ipHash }, 'Invalid DOI format rejected');
    return res.status(400).json({ error: 'Malformed DOI input' });
  }

  // ── Layer 1: Unpaywall (Legal Open Access) ──
  const oaPdfUrl = await tryUnpaywall(doi);
  if (oaPdfUrl) {
    const streamed = await streamPdf(oaPdfUrl, doi, res);
    if (streamed) return;
    logger.debug({ doi }, 'Unpaywall URL found but streaming failed');
  }

  // ── Layer 2: Direct Sci-Hub PDF CDN ──
  const cdnUrl = await trySciHubCDN(doi);
  if (cdnUrl) {
    const streamed = await streamPdf(cdnUrl, doi, res);
    if (streamed) return;
    logger.debug({ doi }, 'CDN URL found but streaming failed');
  }

  // ── Layer 3: Sci-Hub HTML Page Parsing ──
  const parsedUrl = await trySciHubHTML(doi);
  if (parsedUrl) {
    const streamed = await streamPdf(parsedUrl, doi, res);
    if (streamed) return;
    logger.debug({ doi }, 'HTML-parsed URL found but streaming failed');
  }

  // ── All strategies exhausted ──
  logger.warn({ doi }, 'All download sources exhausted');
  res.status(502).json({
    error: 'PDF not available through automated download.',
    fallbackUrl: `https://doi.org/${doi}`,
    scholarUrl: `https://scholar.google.com/scholar?q=${encodeURIComponent(doi)}`,
    details: 'This paper may not be in the open-access or Sci-Hub databases. Try the DOI.org or Google Scholar links.'
  });
});

/**
 * Availability check endpoint
 */
router.get('/check/*', async (req, res) => {
  const doi = req.params[0]?.trim();

  if (!doi || !DOI_REGEX.test(doi)) {
    return res.status(400).json({ error: 'Malformed DOI input' });
  }

  const sources: Array<{ name: string; available: boolean; url?: string }> = [];

  const oaUrl = await tryUnpaywall(doi);
  sources.push({ name: 'Unpaywall (Open Access)', available: !!oaUrl, url: oaUrl || undefined });

  const cdnUrl = await trySciHubCDN(doi);
  sources.push({ name: 'Sci-Hub CDN', available: !!cdnUrl, url: cdnUrl || undefined });

  sources.push({ name: 'DOI.org (Publisher)', available: true, url: `https://doi.org/${doi}` });

  res.json({ doi, sources, circuitBreaker: circuitBreaker.stats });
});

export default router;
