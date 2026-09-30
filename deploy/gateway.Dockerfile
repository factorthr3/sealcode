# syntax=docker/dockerfile:1.7
# The Sealcode gateway: one bundled file on a digest-pinned Node image, no node_modules.
# Build from the repository root:  docker buildx build -f deploy/gateway.Dockerfile .
ARG NODE_IMAGE=node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

FROM ${NODE_IMAGE} AS build
WORKDIR /src
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/gateway/package.json apps/gateway/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter "@sealcode/gateway..."
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/gateway apps/gateway
RUN pnpm --filter @sealcode/gateway build

FROM ${NODE_IMAGE}
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /src/apps/gateway/dist/index.js ./index.js
USER node
EXPOSE 8787
CMD ["node", "index.js"]
