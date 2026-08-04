# Single-stage: the build output and the server share one small runtime, and
# the whole app is a few hundred KB of static assets plus one Node process.
FROM node:22-slim

WORKDIR /app

# Dependencies first so a source-only change reuses the install layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# GEMINI_API_KEY is supplied at runtime — never baked into the image.
CMD ["node", "server.mjs"]
