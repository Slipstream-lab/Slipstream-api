# syntax=docker/dockerfile:1

# --- Build stage ---------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies (including dev) for building.
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client and build the app.
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# Prune dev dependencies for a lean runtime image.
RUN npm prune --omit=dev

# --- Runtime stage -------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only what the runtime needs.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

# The slipstream-core binary is expected on PATH or mounted; set SLIPSTREAM_BIN
# accordingly at runtime.
EXPOSE 3000
CMD ["node", "dist/main.js"]
