export const compressJson = (data: unknown): Uint8Array => {
  const json = JSON.stringify(data);
  return Bun.gzipSync(json);
};

export const decompressJson = <T>(compressed: Uint8Array): T => {
  const json = new TextDecoder().decode(Bun.gunzipSync(compressed));
  return JSON.parse(json) as T;
};

export const sha256Hex = (data: Uint8Array | string): string => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return hasher.digest("hex");
};

export const MAX_COMPRESSED_BYTES = 64 * 1024;

export const assertCompressedSize = (compressed: Uint8Array): void => {
  if (compressed.byteLength > MAX_COMPRESSED_BYTES) {
    throw new Error(`Compressed payload exceeds ${MAX_COMPRESSED_BYTES} bytes`);
  }
};
