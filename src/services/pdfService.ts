import * as pdfjs from 'pdfjs-dist';

// Use CDN for PDF.js worker matching the package's exact version to prevent version mismatch errors
// @ts-ignore
const pdfjsVersion = pdfjs.version || '5.7.284';
// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

import { ExtractionResult, ReferenceItem } from "../types";

// Helper to convert base64 to Uint8Array safely
const base64ToUint8Array = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// DOI extraction logic from text
const extractDoisFromText = (fullText: string): ReferenceItem[] => {
  const doiRegex = /10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]{5,}/g;
  const matches = fullText.match(doiRegex) || [];

  const uniqueDois = Array.from(new Set(matches.map(d => d.replace(/[.,;]$/, ''))))
    .filter(doi => !doi.toLowerCase().startsWith('10.13039'));

  const references: ReferenceItem[] = [];

  uniqueDois.forEach(cleanDoi => {
    const indices: number[] = [];
    let lastIndex = fullText.indexOf(cleanDoi);
    while (lastIndex !== -1) {
      indices.push(lastIndex);
      lastIndex = fullText.indexOf(cleanDoi, lastIndex + 1);
    }

    let bestIndex = indices[0];
    let maxBibliographicScore = -1;

    indices.forEach(idx => {
      const context = fullText.substring(Math.max(0, idx - 100), idx);
      const score = (context.match(/\[\d+\]|\d+\.\s+|(\d{4})/) ? 10 : 0);
      if (score >= maxBibliographicScore) {
        maxBibliographicScore = score;
        bestIndex = idx;
      }
    });

    const index = bestIndex;
    if (index === undefined) return;

    const contextBefore = fullText.substring(Math.max(0, index - 350), index);

    let cleanContext = contextBefore
      .replace(/https?:\/\/\S+/g, '')
      .replace(/doi:?\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    const segments = cleanContext.split(/(?:\.\s+|"\s*|\(\d{4}\)\s+)/);

    let bestTitle = 'Cited Article';
    let maxScore = -1;

    const candidateSegments = segments.slice(-4);

    candidateSegments.forEach(seg => {
      let s = seg.trim();
      s = s.replace(/^[\d\s.\-–—\[\](),]+/, '');
      s = s.replace(/^([A-Z\u00C0-\u017F][a-z\u00C0-\u017F]+(,\s+[A-Z]\.|\s+[A-Z]\.|\s+[A-Z][a-z]+)*[;,\s]+)+/, '');
      s = s.replace(/^([A-Z\u00C0-\u017F][a-z\u00C0-\u017F]+(\s+[A-Z])+[;,]\s+)+/, '');
      s = s.replace(/,\s*\d+.*$/, '');
      s = s.replace(/\d+\s*\(\d{4}\)\s*\d+[-–—]\d+.*$/, '');
      s = s.replace(/[,.]\s*$/, '').trim();

      if (s.length < 15 || s.length > 250) return;

      const words = s.split(/\s+/).length;
      const upperCount = (s.match(/[A-Z]/g) || []).length;
      const score = words + (upperCount > 2 ? 5 : 0);

      if (score > maxScore) {
        maxScore = score;
        bestTitle = s;
      }
    });

    if (bestTitle.length < 15 || bestTitle === 'Cited Article') {
      const fallback = cleanContext.split(/[.!?]/).pop()?.trim() || '';
      bestTitle = fallback.length > 20 ? fallback : `Article: ${cleanDoi}`;
    }

    references.push({
      title: bestTitle.substring(0, 250),
      doi: cleanDoi
    });
  });

  return references;
};

export const extractDoisFromPdf = async (
  base64: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ExtractionResult> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Extraction timeout after 30 seconds")), 30000)
  );

  const extractionPromise = (async () => {
    try {
      onProgress?.(5, 'Decoding PDF data...');

      const data = base64ToUint8Array(base64);

      onProgress?.(10, 'Validating PDF format...');
      const magic = String.fromCharCode(...data.slice(0, 5));
      if (magic !== '%PDF-') {
        throw new Error("INVALID_PDF_FORMAT: Magic bytes mismatch");
      }

      onProgress?.(15, 'Loading PDF document...');
      const loadingTask = pdfjs.getDocument({
        data: data,
        useSystemFonts: true,
        stopAtErrors: false,
        disableFontFace: false,
        useWorkerFetch: false,
        cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/cmaps/`,
        cMapPacked: true,
      });

      console.log('PDFService: getDocument called');
      const pdf = await loadingTask.promise;
      console.log('PDFService: getDocument resolved. Total pages:', pdf.numPages);

      const totalPages = Math.min(pdf.numPages, 150);

      onProgress?.(20, `Document loaded: ${totalPages} pages to analyze...`);

      let fullText = "";
      let paperTitle = "Extracted Document";
      const startTime = Date.now();

      for (let i = 1; i <= totalPages; i++) {
        // Timeout check inside loop
        if (Date.now() - startTime > 30000) {
          throw new Error("Extraction timeout after 30 seconds");
        }

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        const pageText = textContent.items
          .map((item: any) => {
            return item.str
              .replace(/[\x00-\x1F\x7F]/g, "")
              .replace(/[\u202E\u202D\u202B\u202A\u200E\u200F]/g, "");
          })
          .join(" ");

        fullText += pageText + "\n";

        if (fullText.length > 2 * 1024 * 1024) {
          throw new Error("MEMORY_GUARD: Extracted text exceeds 2MB limit");
        }

        if (i === 1) {
          const firstLines = textContent.items
            .map((item: any) => item.str)
            .filter((str: string) => str.trim().length > 10);
          if (firstLines.length > 0) {
            paperTitle = firstLines[0];
          }
        }

        const progressPercent = 20 + Math.round((i / totalPages) * 50);
        if (i % Math.max(1, Math.floor(totalPages / 10)) === 0 || i === totalPages) {
          onProgress?.(progressPercent, `Analyzing page ${i}/${totalPages}...`);
        }
      }

      if (!fullText.trim()) {
        throw new Error("No text content extracted.");
      }

      onProgress?.(75, 'Extracting DOIs and references...');
      const references = extractDoisFromText(fullText);

      onProgress?.(90, 'Finalizing results...');

      const tailLength = 10000;
      const bibliographyText = fullText.length > tailLength
        ? fullText.substring(fullText.length - tailLength)
        : fullText;

      onProgress?.(100, 'Complete');

      return {
        paperTitle,
        references,
        skippedCount: 0,
        rawText: bibliographyText
      };
    } catch (error: any) {
      console.error('PDFService: Error caught in extractionPromise', error);
      throw error;
    }
  })();

  return Promise.race([extractionPromise, timeoutPromise]).then(res => {
    console.log('PDFService: Promise.race resolved');
    return res;
  }).catch(err => {
    console.error('PDFService: Promise.race rejected', err);
    throw err;
  }) as Promise<ExtractionResult>;
};
