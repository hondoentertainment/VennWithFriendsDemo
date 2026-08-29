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

`npm start` is the Node host path (Render, Fly.io, Railway, Cloud Run): one
process serves `dist/` and the `/api` + `/r` handlers. A `Dockerfile` is
included for hosts that build from one; hosts that build from source should
use `npm ci && npm run build` with `npm start` as the start command. Set
`GEMINI_API_KEY` as a runtime secret.

[`render.yaml`](render.yaml) is a ready blueprint: point Render at the repo,
set `GEMINI_API_KEY` in the dashboard, and it provisions the service with the
persistent disk and proxy settings already correct.

### Vercel

Vercel will not run `npm start` and has no persistent disk. The Vite build
alone would drop every AI call and every share link. This repo ships a
small adapter instead:

- [`vercel.json`](vercel.json) builds with `npm run build`, publishes `dist/`,
  rewrites client routes to the SPA, and sends `/api/*` and `/r/*` to a
  Node function.
- [`api/[...path].mjs`](api/%5B...path%5D.mjs) wraps the existing
  `createApiHandler` / `createShareHandler` — Gemini, guards, and validation
  stay in `server/*.mjs`.
- Shared rounds go to [Vercel Blob](https://vercel.com/docs/vercel-blob)
  (`@vercel/blob`) when `VERCEL` is set. Set `ROUNDS_DIR` to keep the
  filesystem store (tests and `npm start` do this automatically).

**Project setup**

1. Import the GitHub repo as a Vercel project (Framework Preset: Vite).
2. Add `GEMINI_API_KEY` for **Production** and **Preview**.
3. Create a Blob store in the project's Storage tab and connect it to
   Production and Preview. Vercel injects `BLOB_READ_WRITE_TOKEN` (and OIDC
   when the store is connected). Share permalinks need this store — without
   it, creating a `/r/:id` link will fail.
4. Optional: set `PUBLIC_URL` to the canonical origin (`https://your.domain`).
   When unset, production uses `VERCEL_PROJECT_PRODUCTION_URL` and preview
   uses `VERCEL_URL`.
5. Optional: `ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS` (defaults to `1` on
   Vercel), and the rate-limit variables below.

Rate limiting and the concurrency gate stay in-process. On Vercel that is
per-isolate — a best-effort bound, not a global one.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Required. Server-side only. |
| `PORT` | `3000` | Listen port. |
| `ALLOWED_ORIGINS` | _(none)_ | Comma-separated origins allowed to call `/api/*` cross-origin. Same-origin always works. |
| `TRUST_PROXY_HOPS` | `0` (`1` when `VERCEL` is set) | Number of proxies in front. Set to `1` behind a single load balancer so rate limiting sees real client IPs. |
| `RATE_LIMIT_CREDITS` | `60` | Credits per client per window. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Refill window. |
| `MAX_CONCURRENT_UPSTREAM` | `8` | Simultaneous Gemini calls before shedding load with a 503. |
| `MAX_BODY_BYTES` | `256000` | Request body cap. |
| `PUBLIC_URL` | _(request host; on Vercel, `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`)_ | Absolute base for share links and Open Graph tags. Set this in production if the automatic host is wrong. |
| `ROUNDS_DIR` | `.data/rounds` | Filesystem store for shared rounds. Forces disk even on Vercel. |
| `BLOB_READ_WRITE_TOKEN` | _(injected by Vercel Blob)_ | Required on Vercel for share permalinks unless `ROUNDS_DIR` is set. |
| `ROUNDS_TTL_MS` | 30 days | How long a shared round stays reachable. |
| `ROUNDS_MAX` | `5000` | Cap on stored rounds; oldest are dropped first. |

### Shared rounds

The results screen can mint a permalink (`/r/:id`) for a finished round. The
page is served with its own Open Graph tags and the AI-generated fusion image,
so a posted link unfurls with the picture the model made from the winning
answer rather than a bare text card.

On a Node host, rounds are one JSON file and one PNG per round under
`ROUNDS_DIR` — no database, so `npm start` stays a single process. Two
consequences worth knowing:

- **The disk must be persistent.** On a host with an ephemeral filesystem,
  every deploy breaks already-posted links. `render.yaml` mounts a disk for
  exactly this reason. On Vercel the Blob store is that durable place.
- **Rounds expire** after `ROUNDS_TTL_MS` (30 days by default). They contain
  player-chosen names and free text, so keeping them forever isn't a default
  anyone chose deliberately. Raise it if you want durable links.

Ids are unguessable and there is no listing endpoint, so a round is reachable
only by its link — but anyone with that link can read it. Treat it as public.

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
