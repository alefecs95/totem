# --- Build ---
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime (estático via Nginx + proxy /api/) ---
FROM nginx:alpine
COPY nginx.conf.template /tmp/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["/docker-entrypoint.sh"]
