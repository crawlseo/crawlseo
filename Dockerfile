FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma generate needs a syntactically valid DATABASE_URL but never connects.
# Inline it so it does not persist as an image layer.
RUN DATABASE_URL="postgresql://build:build@localhost/build" npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# The Prisma CLI (for `migrate deploy` at startup) gets its OWN complete
# node_modules tree at /prisma-cli, rather than cherry-picking packages into the
# app's slim standalone tree.
#
# Why: selective copying cannot work. Copying only @prisma/engines failed on
# @prisma/debug; copying all of @prisma/ then failed on `effect`, a third-party
# transitive of @prisma/config. The CLI's dependency closure is deep and not
# scoped, so any hand-picked subset is one release away from breaking again.
#
# Also note node_modules/.bin/prisma is deliberately NOT copied: npm makes it a
# symlink into prisma/build/, `COPY` dereferences it into a plain file, and the
# CLI then resolves its assets relative to .bin/ and dies with ENOENT on
# prisma_schema_build_bg.wasm. Invoke build/index.js directly instead.
COPY --from=builder /app/node_modules /prisma-cli/node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Invoke the CLI at its real path, NOT via node_modules/.bin/prisma. In npm that
# bin entry is a SYMLINK into prisma/build/; `COPY` dereferences it into a plain
# file under .bin/, so the CLI then resolves its assets relative to .bin/ and dies
# with ENOENT on prisma_schema_build_bg.wasm.
CMD ["sh", "-c", "node /prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma && node server.js"]
