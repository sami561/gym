# syntax=docker/dockerfile:1.7
# One image for every NestJS microservice; the compose file picks the app with
# `command: node dist/apps/<app>/main.js`.

FROM node:20.20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY libs ./libs
COPY apps ./apps
RUN npm run build

FROM node:20.20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:20.20-alpine AS runtime
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    TZ=Africa/Tunis
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
# Overridden per service in docker-compose.yml
CMD ["node", "dist/apps/api-gateway/main.js"]
