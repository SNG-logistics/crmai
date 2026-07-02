# Backend container for Google Cloud Run.
# ⚠️  Cloud Run's filesystem is EPHEMERAL. The current SQLite DB and the WhatsApp
#     auth folder (auth_whatsapp/) and /uploads will NOT persist across restarts.
#     Before relying on this in production, move:
#       - the database  -> Cloud SQL (Postgres)  [see FIREBASE_SETUP.md]
#       - file uploads  -> Firebase / Cloud Storage
#       - WhatsApp creds -> a persistent store (or keep WhatsApp on a VM)
#     Until then, use this image for the API only, or run the backend on a VM.

FROM node:20-bookworm-slim AS build
WORKDIR /app

# OpenSSL is required by Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma

# Cloud Run provides PORT (default 8080); the app already reads process.env.PORT.
EXPOSE 8080
CMD ["node", "dist/index.js"]
