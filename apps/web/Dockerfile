# Build context is the repo root (a pnpm workspace) -- see the
# `docker build -f apps/web/Dockerfile .` invocation in the root
# README, not `apps/web` alone, since @questlearn/web depends on the
# workspace package @questlearn/design-system.
#
# NEXT_PUBLIC_API_URL is inlined into the client bundle at build time
# (Next.js convention for NEXT_PUBLIC_* vars), so it's a build ARG,
# not a runtime env var -- a container built for one API origin can't
# be repointed at another without rebuilding.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

FROM base AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV DOCKER_BUILD=1
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @questlearn/web build

# next.config.js sets `output: "standalone"`, which traces the
# server's real dependency graph and emits a self-contained
# .next/standalone (a trimmed node_modules + server.js) -- the
# officially recommended shape for a Next.js production Docker image,
# and far simpler/more reliable than hand-assembling a pnpm prod
# install for a Next app.
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
# No apps/web/public directory exists in this app (no static assets
# committed), so there's nothing to copy here.

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
