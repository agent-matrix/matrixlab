# Multi-stage build: compile the Vite/React console, then serve the
# static dist through nginx on the port Hugging Face Spaces expects (7860).
# Designed to run as a stateless Docker SDK Space — the console is
# pure client-side and connects to whichever MatrixLab Runner the
# user configures from the Settings modal at runtime.

# ---------- 1. Build stage ----------
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first so layer caching is friendly to source-only changes.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the console source and build the production bundle.
COPY frontend/ ./
RUN npm run build

# ---------- 2. Runtime stage ----------
FROM nginx:1.27-alpine

# HF Spaces require the container to listen on $PORT (default 7860) and
# expects /tmp/ to be writable. We can't rely on /var/cache/nginx being
# writable as the unprivileged user HF assigns, so we redirect every
# cache path nginx touches into /tmp before starting.
ENV NGINX_PORT=7860

# nginx config (SPA fallback, gzip, security headers).
COPY hf-console/nginx.conf /etc/nginx/conf.d/default.conf

# Production bundle from the build stage.
COPY --from=build /app/dist /usr/share/nginx/html

# Smoke check during image build: index.html must exist or the deploy
# is broken before it ever reaches the registry.
RUN test -s /usr/share/nginx/html/index.html

EXPOSE 7860

# Run as a non-root user (HF Spaces convention); redirect the writable
# bits nginx needs into a path the unprivileged user can own.
RUN mkdir -p /tmp/nginx \
 && chown -R 101:101 /tmp/nginx /usr/share/nginx/html /etc/nginx/conf.d \
 && sed -i 's|/var/run/nginx.pid|/tmp/nginx/nginx.pid|' /etc/nginx/nginx.conf

USER 101

CMD ["nginx", "-g", "daemon off;"]
