# File: /Dockerfile | Version: 0.1.1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && mkdir -p /var/lib/duh && chown node:node /var/lib/duh
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3210
CMD ["node", "build/src/server.js"]