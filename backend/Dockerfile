FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
# Tools needed at runtime or during build steps
RUN apk add --no-cache openssl wget postgresql-client gzip
# Optional antivirus tooling (off by default to keep images light)
ARG ENABLE_CLAMAV=false
RUN if [ "$ENABLE_CLAMAV" = "true" ]; then apk add --no-cache clamav clamav-db freshclam; fi

COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma/
COPY . .

RUN chmod +x start.sh && sed -i 's/\r$//' start.sh
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl wget postgresql-client gzip
ARG ENABLE_CLAMAV=false
RUN if [ "$ENABLE_CLAMAV" = "true" ]; then apk add --no-cache clamav clamav-db freshclam; fi

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/start.sh ./start.sh

EXPOSE 5000
CMD ["./start.sh"]