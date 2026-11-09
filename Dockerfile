# Production image for AWS Fargate. Built and pushed by `cdk deploy` (infra/).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Prisma CLI with its own dependencies, for `migrate deploy` at start-up.
# (Copying only node_modules/prisma misses packages it needs, such as effect.)
FROM node:22-bookworm-slim AS prismacli
WORKDIR /cli
COPY package.json /tmp/app-package.json
RUN npm init -y >/dev/null && npm install --no-package-lock --no-fund --no-audit "prisma@$(node -p "require('/tmp/app-package.json').devDependencies.prisma")"

FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prismacli /cli/node_modules /opt/prisma-cli/node_modules
COPY scripts/docker-entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && useradd -m app && chown -R app /app
USER app
EXPOSE 3000
CMD ["./entrypoint.sh"]
