# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 fontconfig fonts-liberation fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000 9229
CMD ["npx", "tsx", "watch", "--inspect=0.0.0.0:9229", "src/index.ts"]

FROM deps AS test
ENV NODE_ENV=test IN_DOCKER=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer poppler-utils fonts-liberation2 fonts-noto-core fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/* \
 && soffice --headless --terminate_after_init || true
COPY . .
CMD ["npm", "run", "test"]

FROM base AS prod
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.js"]
