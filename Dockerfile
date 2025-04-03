FROM node:22.14-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files to leverage Docker cache
COPY package.json pnpm-lock.yaml* ./

# Use pnpm store for better caching
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build the project
RUN pnpm build

FROM node:22.14-alpine AS release

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/build/ ./build/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

ENV NODE_ENV=production

# Install only production dependencies and skip prepare scripts
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts

# Set permissions for entrypoint
RUN chmod +x build/src/index.js

# Default command to run the server
ENTRYPOINT ["node", "/app/build/src/index.js"]
