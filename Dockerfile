FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ARG APP_VERSION=development
ARG APP_COMMIT_SHA=unknown

LABEL org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_COMMIT_SHA}"

WORKDIR /app

ENV APP_VERSION="${APP_VERSION}" \
    APP_COMMIT_SHA="${APP_COMMIT_SHA}" \
    DATA_DIRECTORY=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && mkdir /app/data \
    && chown node:node /app/data

COPY --from=build /app/dist ./dist

USER node

CMD ["node", "dist/index.js"]
