# ---- build ----
FROM node:20.19-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Empty = same origin: the browser calls /api on the nginx below, which proxies the gateway.
ARG VITE_API_URL=
ARG VITE_APP_STORE_URL=
ARG VITE_PLAY_STORE_URL=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_STORE_URL=$VITE_APP_STORE_URL \
    VITE_PLAY_STORE_URL=$VITE_PLAY_STORE_URL
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
