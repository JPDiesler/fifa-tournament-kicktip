# ---- build frontend ----
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build      # outputs to /server/public via vite config -> /web/../server/public

# ---- build server deps (compiles native better-sqlite3 with a toolchain) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

# ---- runtime (server + built frontend) ----
# Lean image: copy the already-compiled node_modules from the deps stage (same
# node/glibc → ABI-compatible), no build toolchain in the final image.
FROM node:20-bookworm-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/ ./
COPY --from=web /server/public ./public
ENV PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "index.js"]
