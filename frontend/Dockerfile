FROM node:24-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for optimal layer caching
COPY package.json package-lock.json* .npmrc ./

# Use npm ci when lockfile exists (faster, deterministic), fall back to npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps; \
    else \
      npm install --legacy-peer-deps; \
    fi

# Copy source files (respects .dockerignore)
COPY . .

# --- Development stage ---
FROM builder AS dev
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- Production build stage ---
FROM builder AS prod-build
RUN npm run build

# --- Production stage ---
FROM nginx:alpine

# SPA routing: all non-file routes serve index.html
RUN printf 'server {\n\
  listen 80;\n\
  server_name localhost;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
\n\
  location /assets/ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=prod-build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
