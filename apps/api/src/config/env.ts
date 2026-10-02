import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
    BULLMQ_PREFIX: z.string().min(1).optional(),
    JWT_ACCESS_SECRET: z.string().min(32),
    REFRESH_TOKEN_PEPPER: z.string().min(32),
    CORS_ORIGIN: z.string().min(1),
    COOKIE_SECURE: z.enum(["true", "false"]).transform((v) => v === "true"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(604800),
    REFRESH_REUSE_GRACE_MS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(10000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60000),
    ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(65536),
    ARGON2_TIME_COST: z.coerce.number().int().positive().default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production" && !data.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE must be true when NODE_ENV=production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function parseCorsOrigins(corsOrigin: string): string[] {
  return corsOrigin
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
