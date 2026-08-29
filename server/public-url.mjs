/**
 * Absolute public origin for share permalinks and Open Graph tags.
 *
 * PUBLIC_URL always wins. On Vercel, a production deployment uses
 * VERCEL_PROJECT_PRODUCTION_URL (the production domain, including a custom
 * one when attached) and every other environment falls back to VERCEL_URL so
 * preview links resolve on that deployment.
 */
export function resolvePublicUrl(env = process.env) {
  if (env.PUBLIC_URL) return stripTrailingSlash(env.PUBLIC_URL);
  const host = pickVercelHost(env);
  if (!host) return undefined;
  return `https://${stripProtocol(host)}`;
}

function pickVercelHost(env) {
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return env.VERCEL_PROJECT_PRODUCTION_URL;
  }
  return env.VERCEL_URL || env.VERCEL_PROJECT_PRODUCTION_URL;
}

function stripProtocol(host) {
  return stripTrailingSlash(String(host).replace(/^https?:\/\//, ''));
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/$/, '');
}
