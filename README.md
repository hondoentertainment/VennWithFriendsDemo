<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Venn with Friends

A fast-paced party game where you battle an AI opponent to find the creative
intersection between two random images. Built with React, Vite, Tailwind CSS,
and the Gemini API.

View the original app in AI Studio: https://ai.studio/apps/drive/1N9-DzYIr4ivjv3kXSLkY5vTnOqs23dHX

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key.
   The key is only used server-side (see `server/genai.mjs`) — it is never
   bundled into the client.
3. Run the app:
   `npm run dev`

The Vite dev server also serves the `/api/*` Gemini proxy, so `npm run dev`
is all you need.

## Production

```sh
npm run build   # bundle the client into dist/
npm start       # serve dist/ plus the /api proxy on PORT (default 3000)
```

The app needs a Node host (Render, Fly.io, Railway, Cloud Run) — static
hosting would drop the `/api` proxy and break every AI call. A `Dockerfile` is
included for hosts that build from one; hosts that build from source should
use `npm ci && npm run build` with `npm start` as the start command. Set
`GEMINI_API_KEY` as a runtime secret.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Required. Server-side only. |
| `PORT` | `3000` | Listen port. |
| `ALLOWED_ORIGINS` | _(none)_ | Comma-separated origins allowed to call `/api/*` cross-origin. Same-origin always works. |
| `TRUST_PROXY_HOPS` | `0` | Number of proxies in front. Set to `1` behind a single load balancer so rate limiting sees real client IPs. |
| `RATE_LIMIT_CREDITS` | `60` | Credits per client per window. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Refill window. |
| `MAX_CONCURRENT_UPSTREAM` | `8` | Simultaneous Gemini calls before shedding load with a 503. |
| `MAX_BODY_BYTES` | `256000` | Request body cap. |

### Abuse controls

The API key never reaches the browser, but a deployed proxy is still a
billable Gemini endpoint. `server/guard.mjs` bounds the damage: cross-origin
callers are denied unless allowlisted, each client IP gets a token bucket
priced per route (image generation costs 8× a text call), simultaneous
upstream calls are capped, and `server/validate.mjs` narrows every payload to
the fields the prompt actually uses before it reaches the model.

**These controls bound abuse; they do not authenticate anyone.** A direct
client can still spend at the rate limit. A public deployment that matters
needs real user auth in front of `/api/*` — set `TRUST_PROXY_HOPS` correctly
first, or per-IP limiting sees only your load balancer.

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
```

All three run in CI on every pull request.

## Notes

- [`docs/multiplayer.md`](docs/multiplayer.md) — what real multiplayer would
  take, and why it isn't built yet.
