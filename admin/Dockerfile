# --- Build ---
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime (estático via Nginx + proxy /api/ em runtime) ---
FROM nginx:alpine
RUN apk add --no-cache gettext
COPY nginx.conf.template /tmp/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_URL=http://totem_totem-api:3001
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
