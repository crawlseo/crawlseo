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
COPY package-lock.json ./
# Keep the migration CLI in the image instead of downloading it through npx at
# container startup. Reading the version from the lockfile keeps it aligned with
# the generated Prisma client.
RUN npm install --global "prisma@$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")" \
    && npm cache clean --force
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]
