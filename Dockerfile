FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM dependencies AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

FROM dependencies AS builder
COPY . .
ENV BUILD_STANDALONE=1
# Build-only placeholder so page-data collection passes env validation;
# runtime containers receive the real DATABASE_URL from compose.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
RUN mkdir -p public && npm run build

FROM node:20-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static
COPY --chown=node:node --from=builder /app/prisma ./prisma
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM dependencies AS worker
COPY --chown=node:node . .
ENV NODE_ENV=production
RUN mkdir -p /tmp/startrace && chown -R node:node /tmp/startrace
USER node
CMD ["npm", "run", "worker"]
