import { requireAuthSecret } from "../env.ts";

export const hashWithSalt = (value: string): string => {
  const salt = requireAuthSecret();
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(salt);
  hasher.update(value);
  return hasher.digest("hex").slice(0, 32);
};
