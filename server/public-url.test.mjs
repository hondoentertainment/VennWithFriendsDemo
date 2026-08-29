import { describe, expect, it } from 'vitest';
import { resolvePublicUrl } from './public-url.mjs';

describe('resolvePublicUrl', () => {
  it('prefers an explicit PUBLIC_URL', () => {
    expect(
      resolvePublicUrl({
        PUBLIC_URL: 'https://venn.app/',
        VERCEL_PROJECT_PRODUCTION_URL: 'prod.vercel.app',
        VERCEL_URL: 'preview.vercel.app',
      })
    ).toBe('https://venn.app');
  });

  it('uses the production domain on a production Vercel deploy', () => {
    expect(
      resolvePublicUrl({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'venn.app',
        VERCEL_URL: 'venn-git-main-team.vercel.app',
      })
    ).toBe('https://venn.app');
  });

  it('uses the deployment URL on preview so links resolve there', () => {
    expect(
      resolvePublicUrl({
        VERCEL_ENV: 'preview',
        VERCEL_PROJECT_PRODUCTION_URL: 'venn.app',
        VERCEL_URL: 'venn-git-feat-team.vercel.app',
      })
    ).toBe('https://venn-git-feat-team.vercel.app');
  });

  it('strips a scheme if Vercel already included one', () => {
    expect(resolvePublicUrl({ VERCEL_URL: 'https://preview.vercel.app/' })).toBe(
      'https://preview.vercel.app'
    );
  });

  it('returns undefined when nothing is configured', () => {
    expect(resolvePublicUrl({})).toBeUndefined();
  });
});
