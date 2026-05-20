import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["*"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://*"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://*"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://*"],
      imgSrc: ["*"],
      workerSrc: ["'self'", "blob:", "https://cdnjs.cloudflare.com", "https://*"],
      connectSrc: ["*"],
      frameAncestors: ["*"],
    },
  },
  xPoweredBy: false,
  referrerPolicy: { policy: 'no-referrer' },
});
