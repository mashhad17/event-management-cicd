# Multi-stage build: "test" runs the unit tests, "runtime" is the image that gets deployed.
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

FROM base AS test
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test

FROM base AS runtime
RUN npm ci --omit=dev --no-audit --no-fund
COPY app.js server.js validation.js ./
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 3000
USER node
CMD ["node", "server.js"]
