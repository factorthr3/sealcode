# syntax=docker/dockerfile:1.7
# The Sealcode web app (marketing site, dashboard, trust center) plus the migration tool.
# Build from the repository root:
#   docker buildx build -f deploy/web.Dockerfile --build-arg SOURCE_COMMIT=v1.0.0 .
ARG NODE_IMAGE=node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

FROM ${NODE_IMAGE} AS build
WORKDIR /src
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter "@sealcode/web..." --filter "@sealcode/db"
COPY packages packages
COPY apps/web apps/web
COPY docs/customer docs/customer
ARG SOURCE_COMMIT=dev
ENV SOURCE_COMMIT=${SOURCE_COMMIT} NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN pnpm --filter @sealcode/web build && pnpm --filter @sealcode/db build:migrate

FROM ${NODE_IMAGE}
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /src/apps/web/.next/standalone ./
COPY --from=build /src/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /src/apps/web/public ./apps/web/public
COPY --from=build /src/packages/db/dist/migrate.js ./tools/migrate.js
COPY --from=build /src/packages/db/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
