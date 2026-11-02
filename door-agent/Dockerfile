# Meliora door agent — small image for a Raspberry Pi (arm64) or any Linux box on the gym LAN.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production TZ=Africa/Tunis DATA_DIR=/data SCAN_STDIN=false LOG_FORMAT=json
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 8787
USER node
CMD ["node", "dist/index.js"]
