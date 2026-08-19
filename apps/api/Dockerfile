# Build context is the repo root (a pnpm workspace) -- see the
# `docker build -f apps/api/Dockerfile .` invocation in the root
# README, not `apps/api` alone, since @questlearn/api depends on the
# workspace package @questlearn/config.

FROM node:24-alpine AS base
# openssl: required by Prisma's query engine on Alpine/musl.
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @questlearn/api exec prisma generate
RUN pnpm --filter @questlearn/api build

# Copies the already-correctly-built node_modules from the build
# stage rather than re-running a scoped `pnpm install --prod` here:
# the root workspace's postinstall script (which builds
# @questlearn/config and @questlearn/design-system) fires on every
# `pnpm install` regardless of --prod, and a devDependency-free
# install has no `tsc` to run it with. Trading a larger runtime image
# (devDependencies included) for a build that doesn't fight the
# monorepo's own install lifecycle -- acceptable for this project's
# scale; a leaner prod-only image is a documented follow-up, not a
# blocker (see SECURITY_NOTES.md).
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/config/package.json ./packages/config/package.json
COPY --from=build /app/packages/config/node_modules ./packages/config/node_modules

EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
