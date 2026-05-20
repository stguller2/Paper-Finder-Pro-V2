import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  validate: false,
});

export const aiScanLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute for AI scan
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI scan rate limit exceeded. Please wait a minute.' },
  validate: false,
});
