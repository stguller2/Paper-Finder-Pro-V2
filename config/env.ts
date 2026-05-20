import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  GEMINI_API_KEY: z.string().optional(),
  SESSION_SECRET: z.string().min(32).default('a-very-long-fallback-secret-for-development-purposes-only-32-chars'),
  APP_DOMAIN: z.string().url().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('⚠️ Environment validation warning (server continuing):', JSON.stringify(result.error.format(), null, 2));
}

// Fallback to default if validation failed completely
export const env = result.success ? result.data : {
  NODE_ENV: 'development',
  PORT: 3000,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  SESSION_SECRET: 'a-very-long-fallback-secret-for-development-purposes-only-32-chars',
  APP_DOMAIN: undefined
};

/**
 * Redacts sensitive info from logs
 */
export const redactSecrets = (obj: any): any => {
  const SENSITIVE_KEYS = ['GEMINI_API_KEY', 'SESSION_SECRET', 'apiKey', 'password', 'token'];
  const redacted = { ...obj };
  
  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_KEYS.includes(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSecrets(redacted[key]);
    }
  }
  return redacted;
};
