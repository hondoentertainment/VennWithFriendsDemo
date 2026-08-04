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

[`render.yaml`](render.yaml) is a ready blueprint: point Render at the repo,
set `GEMINI_API_KEY` in the dashboard, and it provisions the service with the
persistent disk and proxy settings already correct.

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
| `PUBLIC_URL` | _(request host)_ | Absolute base for share links and Open Graph tags. Set this in production. |
| `ROUNDS_DIR` | `.data/rounds` | Where shared rounds are stored. |
| `ROUNDS_TTL_MS` | 30 days | How long a shared round stays reachable. |
| `ROUNDS_MAX` | `5000` | Cap on stored rounds; oldest are dropped first. |

### Shared rounds

The results screen can mint a permalink (`/r/:id`) for a finished round. The
page is served with its own Open Graph tags and the AI-generated fusion image,
so a posted link unfurls with the picture the model made from the winning
answer rather than a bare text card.

Rounds are one JSON file and one PNG per round under `ROUNDS_DIR` — no
database, so the app stays a single process. Two consequences worth knowing:

- **The disk must be persistent.** On a host with an ephemeral filesystem,
  every deploy breaks already-posted links. `render.yaml` mounts a disk for
  exactly this reason.
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
