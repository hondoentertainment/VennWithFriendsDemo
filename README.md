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

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

Both run in CI on every pull request.
