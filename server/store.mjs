import { createBlobRoundStore } from './blob-store.mjs';
import { createRoundStore } from './rounds.mjs';

/**
 * Shared rounds live on disk for `npm start` / Render, and in Vercel Blob
 * when the process is a Vercel deployment (no persistent filesystem).
 *
 * ROUNDS_DIR always forces the filesystem store, including on Vercel, so
 * tests and a one-off disk mount keep working.
 */
export function usesFilesystemStore(env = process.env) {
  return Boolean(env.ROUNDS_DIR) || !env.VERCEL;
}

export function createStoreFromEnv(env = process.env, options = {}) {
  const ttlMs = Number(env.ROUNDS_TTL_MS) || undefined;
  const maxRounds = Number(env.ROUNDS_MAX) || undefined;
  if (usesFilesystemStore(env)) {
    return createRoundStore({
      dir: env.ROUNDS_DIR || '.data/rounds',
      ttlMs,
      maxRounds,
      ...options,
    });
  }
  return createBlobRoundStore({ ttlMs, maxRounds, ...options });
}
