import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createApiHandler } from './server/genai.mjs';
import { createRoundStore } from './server/rounds.mjs';
import { createShareHandler } from './server/share.mjs';

// Serves the /api/* Gemini proxy and the share routes inside the Vite dev
// server so `npm run dev` is all you need locally. The API key never reaches
// the client bundle.
//
// The /r/:id page route is deliberately not handled here: Vite owns the dev
// shell, so the SPA fallback renders the shared round and only production gets
// the injected Open Graph tags (crawlers never see a dev server anyway).
function apiServer(getApiKey: () => string | undefined): Plugin {
  const store = createRoundStore({ dir: process.env.ROUNDS_DIR || '.data/rounds' });
  return {
    name: 'venn-api-server',
    configureServer(server) {
      server.middlewares.use(createShareHandler({ store }));
      server.middlewares.use(createApiHandler(getApiKey));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), tailwindcss(), apiServer(() => env.GEMINI_API_KEY)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
