# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# Build the app
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .

# NEXT_PUBLIC_* vars must be present at build time
ARG NEXT_PUBLIC_META_APP_ID=""
ARG NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:8000"
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"
ARG NEXT_PUBLIC_PORTAL_DOMAIN="https://resultados.lonemidia.com"
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_PORTAL_DOMAIN=$NEXT_PUBLIC_PORTAL_DOMAIN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Sentry source maps — token necessário apenas em build time, não em runtime
ARG SENTRY_AUTH_TOKEN=""
ARG SENTRY_ORG="lone-midia"
ARG SENTRY_PROJECT="lone-os-portal"
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

# Heap do build: o padrão do Node 20 (~2-4 GB conforme a RAM vista) estourou em 14/09 com o bundle
# crescendo; a VPS tem 8 GB + swap. Sem isto o build morre com "heap out of memory" sem dizer o módulo.
RUN --mount=type=cache,target=/app/.next/cache NODE_OPTIONS=--max-old-space-size=5120 npm run build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
