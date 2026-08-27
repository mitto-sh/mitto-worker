FROM node:20-alpine AS lib-builder
WORKDIR /repo/mitto-lib-ts-orm
COPY mitto-lib-ts-orm/package.json mitto-lib-ts-orm/package-lock.json ./
RUN npm ci
COPY mitto-lib-ts-orm/ ./
RUN npm run build

FROM node:20-alpine AS builder
WORKDIR /repo/mitto-worker
COPY mitto-worker/package.json mitto-worker/package-lock.json ./
COPY --from=lib-builder /repo/mitto-lib-ts-orm /repo/mitto-lib-ts-orm
RUN npm install --install-links
COPY mitto-worker/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/mitto-worker/dist ./dist
COPY --from=builder /repo/mitto-worker/node_modules ./node_modules
COPY --from=builder /repo/mitto-worker/package.json ./package.json
EXPOSE 3002
CMD ["node", "dist/index.js"]
