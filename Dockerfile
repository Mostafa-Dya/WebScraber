# Serio Ludere catalogue — Node standalone container (docs/ADR.md D2).
# Build:  docker build -t sl-catalogue .
# Run:    docker run --env-file .env -p 4321:4321 sl-catalogue
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# `astro check && astro build`. The two site secrets are validated at build time as well, so the
# build stage gets placeholders; the runtime stage never sees them (real values come from the host).
ENV REVALIDATE_SECRET=build-placeholder-not-a-secret-0000000000 \
    VOTE_SALT=build-placeholder-not-a-secret-0000000000 \
    SITE_URL=https://build-placeholder.invalid
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
