# Academic DOI Linker

Academic DOI Linker is a highly polished, full-stack React and Express application that allows researchers, students, and academics to extract cited paper references from academic PDFs and find direct download and verification links automatically. This application utilizes robust client-side PDF pattern extraction, combined with an intelligent Express backend that proxies metadata resolving and leverages the Gemini 2.5 Flash model for bibliographic reference parsing.

## 🚀 Features

- **Pristine Client-Side Extractor**: Uses `pdfjs-dist` to dynamically parse paper layout elements and scan text for distinct DOI (Digital Object Identifier) patterns.
- **Vibrant & Clean User Interface**: Crafted using React 19, Motion, and Tailwind CSS v4 to establish a modern, distraction-free Single Page Application (SPA).
- **Dual Scan Operations**:
  - **Fast Scan**: High-performance offline algorithm scanning text structures.
  - **Smart Metadata Scan**: Full-stack API proxy integration with Crossref and OpenAlex endpoints to obtain accurate metadata.
- **Intelligent Gemini Backup**: For papers with complex layouts where regex scanning might miss citations, the system automatically proxies text queries or references to **Gemini 2.5 Flash** for advanced bibliographic reference extraction.
- **Export Formats**: Seamlessly generates and downloads your analyzed bibliography in major academic standards including **BibTeX** and **RIS** for direct integration with reference managers like Zotero or Mendeley.
- **Integrated Sci-Hub Proxy Router**: Safe middleware endpoint proxy routing matching DOI addresses to resolve direct PDF formats with circuit breakers.

---

## 🏗️ Project Architecture & Structure

```
├── config/
│   └── env.ts                  # Environment configurations and secrets
├── middleware/
│   ├── logging.ts              # Pino-http based logging middleware
│   ├── rateLimiters.ts         # Secure rate-limiting policies for API
│   └── securityHeaders.ts      # Helmet-powered custom HTTP safety headers
├── routes/
│   ├── aiScan.ts               # Gemini citation processing & Crossref/OpenAlex endpoints
│   ├── export.ts               # BibTeX, RIS, and HTML export generation
│   └── scihubProxy.ts          # Resilient Sci-Hub download CDN resolver and proxy
├── src/
│   ├── components/             # Reusable UX layout cards and buttons
│   ├── hooks/                  # React state machines for parsing lifecycles
│   ├── services/               # Core PDF.js and model integration scripts
│   ├── types.ts                # App state models and reference item typings
│   ├── App.tsx                 # Main layout structure & UI state router
│   └── main.tsx                # Client-side bundle entrypoint
├── server.ts                   # Full-stack Express development and production entrypoint
└── package.json                # Project dependencies and configurations
```

---

## 🔧 Installation & Verification

Follow these steps to run the application locally or in a development container:

### 1. Configure Environment Variables
Create a `.env` file at the root of the project:
```env
# Required for Smart AI scan fallback functionality
GEMINI_API_KEY=your_gemini_api_key_here

# Secret used to encrypt Express sessions/cookies
SESSION_SECRET=default_session_secret_change_me
```

### 2. Install Project Dependencies
Run the package manager to install node modules:
```bash
npm install
```

### 3. Start Development Server
Run the unified Express and Vite dev runner on host `0.0.0.0` and port `3000`:
```bash
npm run dev
```

### 4. Build for Production
Compiles client-side static assets and bundles the backend server into a single `dist/server.cjs` file using `esbuild`:
```bash
npm run build
```

### 5. Start Production Server
Boot the bundled Node application:
```bash
npm run start
```

---

## 🛠️ Solved Technical Challenges & Known Fixes

### PDF.js Version Mismatch Remediation
- **Problem**: When using `pdfjs-dist` inside React bundles, there is often a version mismatch between the worker script and the NPM module's API (e.g., *API version 5.7.284 does not match Worker version 3.11.174*), leading to immediate runtime failures.
- **Mitigation**: The dynamic version extraction in `src/services/pdfService.ts` fetches and constructs the exact URL for `pdf.worker.min.mjs` matching the active package version at runtime:
  ```typescript
  const pdfjsVersion = pdfjs.version || '5.7.284';
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
  ```

### Safe Lazy Initialization for API Secrets
- **Problem**: Instant initialization of SDK clients like Gemini during module loading can crash development servers if required keys are briefly undefined.
- **Mitigation**: We utilize lazy-loaded instance controllers wrapping the SDK client setup, ensuring errors are reported cleanly through the API rather than causing container crashes:
  ```typescript
  let geminiClientInstance: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!geminiClientInstance) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY is required.");
      geminiClientInstance = new GoogleGenAI({ apiKey: key });
    }
    return geminiClientInstance;
  }
  ```

---

## 🔒 Security & Usability Policies

- **Rate Limiting**: Enforces global API request bounds to safeguard metadata endpoints against abuse.
- **Secure CDN Filtering**: Filters proxy downloads to guarantee content-type compliance and avoid arbitrary script executes.
- **Privacy-First**: PDF binary files never leave the reader's local browser unless AI processing is explicitly chosen, ensuring high confidentiality for draft manuscripts.
