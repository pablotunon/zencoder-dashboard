# ---------- base: production deps only ----------
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json ./

# ---------- dev: all deps including vitest ----------
FROM base AS dev
RUN npm install
COPY . .
CMD ["npm", "start"]

# ---------- prod: production deps + source only ----------
FROM base AS prod
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src/ ./src/
CMD ["npm", "start"]
