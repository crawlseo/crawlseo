FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js evaluates the Auth.js configuration while collecting build output.
# These non-secret placeholders keep the image build independent of runtime
# configuration; deployments provide the real values to the final stage.
ENV DATABASE_URL=postgresql://crawlseo:crawlseo@localhost:5432/crawlseo
ENV GOOGLE_CLIENT_ID=docker-build-placeholder
ENV GOOGLE_CLIENT_SECRET=docker-build-placeholder
ENV NEXTAUTH_SECRET=docker-build-placeholder
RUN npx prisma generate
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
# Reuse the Prisma CLI already built in the deps/builder stages instead of
# running a second npm install under QEMU emulation (which crashes with SIGILL
# on arm64). Only the CLI package and its engine binaries are needed for
# `prisma migrate deploy` at container startup.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node server.js"]
