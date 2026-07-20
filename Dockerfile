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
COPY deploy/agent-reach-constraints.txt /tmp/agent-reach-constraints.txt
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && python3 -m venv /opt/agent-reach \
  && /opt/agent-reach/bin/pip install --no-cache-dir \
    -c /tmp/agent-reach-constraints.txt \
    https://github.com/Panniantong/Agent-Reach/archive/1494c2ab239e7355a77e7cceaf3271453a1f34b5.zip \
  && rm -rf /var/lib/apt/lists/* /tmp/agent-reach-constraints.txt
COPY --chown=node:node . .
ENV NODE_ENV=production
ENV PATH="/opt/agent-reach/bin:${PATH}"
RUN mkdir -p /tmp/startrace && chown -R node:node /tmp/startrace
USER node
CMD ["npm", "run", "worker"]
