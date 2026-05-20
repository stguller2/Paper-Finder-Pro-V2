import express from 'express';
import { z } from 'zod';
import axios from 'axios';
import { logger } from '../middleware/logging';

const router = express.Router();

let initStatus: 'idle' | 'downloading' | 'loading' | 'ready' | 'error' = 'ready';
let downloadProgress = 100;
let errorMessage = "";

/**
 * Background Initialization
 */
export async function initializeLocalModel() {
  initStatus = 'ready';
  logger.info('SaaS-Engine: Local / Offline mode active.');
}

/**
 * In-Memory Metadata Cache (LRU + TTL)
 * Prevents redundant API calls for the same DOI within a time window.
 */
interface CacheEntry {
  data: any;
  expiresAt: number;
}

class MetadataCache {
  private store = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 500, ttlMs = 10 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): any | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // LRU: move to end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.data;
  }

  set(key: string, data: any): void {
    if (this.store.size >= this.maxSize) {
      // Evict oldest (first) entry
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  get stats() {
    return { size: this.store.size, maxSize: this.maxSize };
  }
}

const metadataCache = new MetadataCache(500, 10 * 60 * 1000); // 500 entries, 10 min TTL

const RefineSchema = z.object({
  references: z.array(z.object({
    title: z.string(),
    doi: z.string()
  }))
});

// Endpoint to check background status & Health
router.get('/status', (req, res) => {
  res.json({ 
    status: initStatus, 
    progress: downloadProgress,
    queueLength: 0,
    isHealthy: true,
    error: errorMessage
  });
});

/**
 * APA 6th Edition Citation Formatter
 * Format: Author, A. A., & Author, B. B. (Year). Title. Journal, volume(issue), pages. https://doi.org/xxx
 */
function formatAPA6(meta: {
  title: string;
  doi: string;
  authors?: string[];
  year?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}): string {
  let citation = '';

  // Authors
  if (meta.authors && meta.authors.length > 0) {
    if (meta.authors.length === 1) {
      citation += meta.authors[0];
    } else if (meta.authors.length === 2) {
      citation += `${meta.authors[0]}, & ${meta.authors[1]}`;
    } else if (meta.authors.length <= 7) {
      const allButLast = meta.authors.slice(0, -1).join(', ');
      citation += `${allButLast}, & ${meta.authors[meta.authors.length - 1]}`;
    } else {
      // APA 6: 7+ authors → first 6, ..., last
      const firstSix = meta.authors.slice(0, 6).join(', ');
      citation += `${firstSix}, . . . ${meta.authors[meta.authors.length - 1]}`;
    }
  }

  // Year
  citation += ` (${meta.year || 'n.d.'}).`;

  // Title (sentence case, no italic for articles)
  citation += ` ${meta.title}.`;

  // Journal (italic in APA, we use plain text for copy)
  if (meta.journal) {
    citation += ` ${meta.journal}`;
    if (meta.volume) {
      citation += `, ${meta.volume}`;
      if (meta.issue) {
        citation += `(${meta.issue})`;
      }
    }
    if (meta.pages) {
      citation += `, ${meta.pages}`;
    }
    citation += '.';
  }

  // DOI
  citation += ` https://doi.org/${meta.doi}`;

  return citation.trim();
}

/**
 * Extract author names in "Surname, I." format from Crossref data
 */
function parseCrossrefAuthors(authors: any[]): string[] {
  if (!authors || !Array.isArray(authors)) return [];
  return authors.map(a => {
    const family = a.family || '';
    const given = a.given || '';
    if (!family) return given;
    // Convert "John Michael" → "J. M."
    const initials = given.split(/\s+/).map((n: string) => n.charAt(0).toUpperCase() + '.').join(' ');
    return `${family}, ${initials}`;
  });
}

/**
 * Extract author names from OpenAlex data
 */
function parseOpenAlexAuthors(authorships: any[]): string[] {
  if (!authorships || !Array.isArray(authorships)) return [];
  return authorships.map(a => {
    const name = a.author?.display_name || '';
    if (!name) return '';
    const parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0];
    const surname = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map((n: string) => n.charAt(0).toUpperCase() + '.').join(' ');
    return `${surname}, ${initials}`;
  }).filter(Boolean);
}

/**
 * Fetch metadata for a single DOI with controlled concurrency.
 * Returns enriched reference data with APA 6 citation.
 */
async function fetchSingleDOIMetadata(ref: { title: string; doi: string }): Promise<any> {
  const cleanDoi = ref.doi.trim();
  const cacheKey = cleanDoi.toLowerCase();

  // Check cache first
  const cached = metadataCache.get(cacheKey);
  if (cached) {
    logger.debug({ doi: cleanDoi }, 'Metadata cache hit');
    return cached;
  }

  // Parallel fetch from both APIs
  const results = await Promise.allSettled([
    axios.get(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'AcademicDOIApp/1.0 (mailto:admin@doiscan.ai)' }
    }),
    axios.get(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(cleanDoi)}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'AcademicDOIApp/1.0 (mailto:admin@doiscan.ai)' }
    })
  ]);

  let title = ref.title;
  let authors: string[] = [];
  let year = '';
  let journal = '';
  let volume = '';
  let issue = '';
  let pages = '';
  let isVerified = false;

  // Try Crossref first (most complete metadata for APA)
  if (results[0].status === 'fulfilled') {
    const msg = results[0].value.data?.message;
    if (msg) {
      title = msg.title?.[0] || title;
      authors = parseCrossrefAuthors(msg.author);
      year = msg.published?.['date-parts']?.[0]?.[0]?.toString() 
          || msg['published-print']?.['date-parts']?.[0]?.[0]?.toString()
          || msg['published-online']?.['date-parts']?.[0]?.[0]?.toString()
          || '';
      journal = msg['container-title']?.[0] || '';
      volume = msg.volume || '';
      issue = msg.issue || '';
      pages = msg.page || '';
      isVerified = true;
    }
  }

  // Fallback to OpenAlex if Crossref failed or missing authors
  if (authors.length === 0 && results[1].status === 'fulfilled') {
    const oaData = results[1].value.data;
    if (oaData) {
      title = oaData.title || title;
      authors = parseOpenAlexAuthors(oaData.authorships);
      year = year || oaData.publication_year?.toString() || '';
      journal = journal || oaData.primary_location?.source?.display_name || '';
      isVerified = true;
    }
  }

  // Even if only OpenAlex worked, fill in what we can
  if (!isVerified && results[1].status === 'fulfilled') {
    const oaData = results[1].value.data;
    if (oaData) {
      title = oaData.title || title;
      year = oaData.publication_year?.toString() || '';
      journal = oaData.primary_location?.source?.display_name || '';
      isVerified = true;
    }
  }

  const meta = { title, doi: cleanDoi, authors, year, journal, volume, issue, pages };
  const apa6 = formatAPA6(meta);

  const enrichedResult = {
    ...meta,
    apa6,
    isVerified,
    source: isVerified ? 'official' as const : 'regex' as const
  };

  // Cache the result
  metadataCache.set(cacheKey, enrichedResult);

  return enrichedResult;
}

/**
 * Process DOIs in controlled batches to avoid overwhelming the APIs
 */
async function processInBatches<T>(
  items: any[],
  processor: (item: any) => Promise<T>,
  batchSize: number = 10
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Small delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Metadata Refinement + APA 6 Citation Generator
 */
router.post('/refine', async (req, res) => {
  try {
    const validated = RefineSchema.parse(req.body);
    
    logger.info({ count: validated.references.length }, 'Refining references with metadata APIs');
    
    const cleanReferences = await processInBatches(
      validated.references.slice(0, 100),
      fetchSingleDOIMetadata,
      10
    );

    const verifiedCount = cleanReferences.filter(r => r.isVerified).length;
    logger.info({ total: cleanReferences.length, verified: verifiedCount }, 'Refinement complete');

    res.json({ references: cleanReferences, skippedCount: 0 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Refinement failed');
    res.status(500).json({ error: 'Refinement failed.' });
  }
});

/**
 * Gemini AI Extraction (Disabled)
 */
router.post('/extract', async (req, res) => {
  res.json({ references: [], error: "Distant AI models have been disabled in this build." });
});

/**
 * DOI-less Reference Resolution (Disabled)
 */
router.post('/resolve-doiless', async (req, res) => {
  res.json({ resolved: [], stats: { total: 0, withDoi: 0, withoutDoi: 0 }, error: "Distant AI models have been disabled in this build." });
});

/**
 * Citation Context Extraction (Disabled)
 */
router.post('/citation-context', async (req, res) => {
  res.json({ contexts: [], error: "Distant AI models have been disabled in this build." });
});

export default router;
