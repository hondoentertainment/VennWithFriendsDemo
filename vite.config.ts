import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createApiHandler } from './server/genai.mjs';

// Serves the /api/* Gemini proxy inside the Vite dev server so `npm run dev`
// is all you need locally. The API key never reaches the client bundle.
function apiServer(getApiKey: () => string | undefined): Plugin {
  return {
    name: 'venn-api-server',
    configureServer(server) {
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
