import express from 'express';
import crypto from 'crypto';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as any);

const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // Relaxed for better usability in AI Studio
  message: { error: 'Export limit reached. Please wait a minute.' }
});

const ExportSchema = z.object({
  format: z.enum(['bibtex', 'ris', 'html']),
  references: z.array(z.object({
    title: z.string(),
    doi: z.string()
  }))
});

function sanitizeLatex(text: string) {
  return text.replace(/[\{\}\\\$\^_]/g, '');
}

router.post('/generate', exportLimiter, (req, res) => {
  try {
    const { format, references } = ExportSchema.parse(req.body);
    let content = '';
    let filename = `export.${format}`;

    if (format === 'bibtex') {
      content = references.map((ref, idx) => {
        const key = `ref_${idx}`;
        return `@article{${key},\n  title = {${sanitizeLatex(ref.title)}},\n  doi = {${ref.doi}}\n}`;
      }).join('\n\n');
    } else if (format === 'ris') {
      content = references.map(ref => {
        return `TY  - JOUR\nTI  - ${sanitizeLatex(ref.title)}\nDO  - ${ref.doi}\nER  - `;
      }).join('\n');
    } else if (format === 'html') {
      const listItems = references.map(ref => {
        const safeTitle = DOMPurify.sanitize(ref.title, { ALLOWED_TAGS: ['p', 'strong', 'em'] });
        return `<li><p><strong>${safeTitle}</strong> (DOI: <a href="https://doi.org/${ref.doi}">${ref.doi}</a>)</p></li>`;
      }).join('');
      content = `<!DOCTYPE html><html><body><h1>Research Binder</h1><ul>${listItems}</ul></body></html>`;
    }

    // Integrity Hash
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const contentWithHash = content + `\n\n<%-- Integrity Hash: ${hash} --%>\n`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(contentWithHash);
  } catch (error) {
    res.status(400).json({ error: 'Invalid export request' });
  }
});

export default router;
