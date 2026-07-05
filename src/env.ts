const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const moderationMode = process.env.MODERATION_MODE ?? "auto";
if (moderationMode !== "auto" && moderationMode !== "manual") {
  throw new Error('MODERATION_MODE must be "auto" or "manual"');
}

export const env = {
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "dev",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  DATABASE_PATH: process.env.DATABASE_PATH ?? "./data/picto.db",
  MEDIA_ROOT: process.env.MEDIA_ROOT ?? "./data/previews",
  MODERATION_MODE: moderationMode as "auto" | "manual",
  PORT: Number(process.env.PORT ?? 3000),
};

export const requireAuthSecret = (): string =>
  required("BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET);
