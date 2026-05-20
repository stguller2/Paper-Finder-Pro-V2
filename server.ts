import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";
import { env } from "./config/env";
import { securityHeaders } from "./middleware/securityHeaders";
import { globalLimiter } from "./middleware/rateLimiters";
import { httpLogger, requestIdMiddleware, logger } from "./middleware/logging";

// Routers
import scihubProxy from "./routes/scihubProxy";
import aiScan, { initializeLocalModel } from "./routes/aiScan";
import exportRouter from "./routes/export";

const app = express();

// Trust upstream reverse proxy (e.g., Cloud Run, Nginx, GFE)
app.set('trust proxy', true);

// 1. Initial Early Middlewares
app.use(requestIdMiddleware);
app.use(httpLogger);
app.use(securityHeaders);

// 2. CORS & Cookies
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(cookieParser(env.SESSION_SECRET));

// 3. Rate Limiting & Parsing
app.use('/api', globalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. API Routes
app.use('/api/scihub', scihubProxy);
app.use('/api/ai', aiScan);
app.use('/api/export', exportRouter);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: "ok", 
    version: "1.0.0",
    endpoints: {
      scihubHealth: "/api/scihub/health",
      aiHealth: "/api/ai/health"
    }
  });
});

// Comprehensive Sci-Hub Health Check Endpoint
app.get('/api/scihub/health', async (req, res) => {
  const cdns = [
    'https://sci.bban.top',
    'https://zero.sci-hub.se',
  ];

  const mirrors = [
    'https://sci-hub.ee',
    'https://sci-hub.al',
    'https://sci-hub.mk',
    'https://sci-hub.vg',
    'https://sci-hub.ru',
    'https://sci-hub.st',
  ];

  const checkUrl = async (url: string) => {
    const start = Date.now();
    try {
      const response = await axios.get(url, {
        timeout: 3000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        validateStatus: (status) => status < 500, // standard mirror is up even if it returns 4xx
      });
      return {
        url,
        status: "online",
        latency: Date.now() - start,
        statusCode: response.status
      };
    } catch (err: any) {
      return {
        url,
        status: "offline",
        error: err.message,
        latency: Date.now() - start
      };
    }
  };

  const [cdnResults, mirrorResults] = await Promise.all([
    Promise.all(cdns.map(checkUrl)),
    Promise.all(mirrors.map(checkUrl))
  ]);

  const unpaywallStart = Date.now();
  let unpaywallStatus = "offline";
  let unpaywallLatency: number | undefined;
  try {
    const unpaywallRes = await axios.get('https://api.unpaywall.org/v2/10.1038/nature12345?email=admin@doiscan.ai', {
      timeout: 3000
    });
    if (unpaywallRes.status === 200) {
      unpaywallStatus = "online";
      unpaywallLatency = Date.now() - unpaywallStart;
    }
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      unpaywallStatus = "online";
      unpaywallLatency = Date.now() - unpaywallStart;
    }
  }

  const onlineCDNs = cdnResults.filter(r => r.status === "online");
  const onlineMirrors = mirrorResults.filter(r => r.status === "online");
  const overallStatus = (onlineCDNs.length > 0 || onlineMirrors.length > 0) ? "healthy" : "unhealthy";

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    summary: {
      totalCDNs: cdns.length,
      onlineCDNs: onlineCDNs.length,
      totalMirrors: mirrors.length,
      onlineMirrors: onlineMirrors.length,
      unpaywall: unpaywallStatus
    },
    cdns: cdnResults,
    mirrors: mirrorResults,
    unpaywall: {
      status: unpaywallStatus,
      latency: unpaywallLatency
    }
  });
});

// Comprehensive AI/Gemini & Metadata Health Check Endpoint
app.get('/api/ai/health', async (req, res) => {
  const crossrefStart = Date.now();
  let crossrefStatus = "offline";
  let crossrefLatency: number | undefined;
  try {
    await axios.get('https://api.crossref.org/works?rows=1', {
      timeout: 3000,
      headers: { 'User-Agent': 'AcademicDOIApp/1.0 (mailto:admin@doiscan.ai)' }
    });
    crossrefStatus = "online";
    crossrefLatency = Date.now() - crossrefStart;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      crossrefStatus = "online";
      crossrefLatency = Date.now() - crossrefStart;
    }
  }

  const openAlexStart = Date.now();
  let openAlexStatus = "offline";
  let openAlexLatency: number | undefined;
  try {
    await axios.get('https://api.openalex.org/works?sample=1', {
      timeout: 3000,
      headers: { 'User-Agent': 'AcademicDOIApp/1.0 (mailto:admin@doiscan.ai)' }
    });
    openAlexStatus = "online";
    openAlexLatency = Date.now() - openAlexStart;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      openAlexStatus = "online";
      openAlexLatency = Date.now() - openAlexStart;
    }
  }

  const overallStatus = (crossrefStatus === "online") ? "healthy" : "degraded";

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    gemini: {
      status: "disabled",
      latency: 0,
      error: "Distant AI models have been disabled in this build."
    },
    metadataProviders: {
      crossref: {
         status: crossrefStatus,
         latency: crossrefLatency
      },
      openAlex: {
         status: openAlexStatus,
         latency: openAlexLatency
      }
    }
  });
});

// Metrics - Restricted by IP (Production simulation)
app.get('/api/metrics', (req, res) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket.remoteAddress;
  
  if (env.NODE_ENV === 'production' && ip !== '127.0.0.1') {
    return res.status(403).send('Forbidden');
  }
  res.json({ uptime: process.uptime(), memory: process.memoryUsage() });
});

// API 404 Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  // Global Error Handler MUST be after Vite so it catches Vite's errors if any
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const errorId = req.id || 'unknown';
    logger.error({ error_id: errorId, message: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined }, 'Unhandled Error');
    
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      id: errorId,
      message: process.env.NODE_ENV === 'development' ? err.message : 'A generic error occurred. Please contact support.'
    });
  });

  const PORT = env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV }, 'Server started');
    initializeLocalModel().catch(err => logger.error({ err }, 'Background Init Failed'));
  });
}

startServer();
