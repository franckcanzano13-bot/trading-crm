import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().default(''),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(5500),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FINNHUB_API_KEY: z.string().optional().default(''),
  TWELVEDATA_API_KEY: z.string().optional().default(''),
  // Sprint 2.2: CORS whitelist (comma-separated). In dev, * allows any origin.
  CORS_ALLOWED_ORIGINS: z.string().optional().default('*'),
  // Sprint 2.4: encryption key (hex 32 bytes / 64 chars) for AES-256-GCM
  ENCRYPTION_KEY: z.string().optional().default(''),
  // Sprint 4.5: bearer token to access /metrics. Empty = open in dev, denied in prod.
  METRICS_AUTH_TOKEN: z.string().optional().default(''),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
