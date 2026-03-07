FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json vitest.config.ts ./
COPY src/ ./src/

CMD ["npm", "start"]
