# Build everything, then run only the compiled server, the built frontend, and
# production dependencies, as a non-root user. Compilers stay out of the final image.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/

FROM base AS build
RUN npm ci
COPY server server
COPY web web
RUN npm run build

FROM base AS deps
RUN npm ci --omit=dev -w server --include-workspace-root

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY server/widget server/widget
COPY --from=build /app/web/dist web/dist
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
VOLUME /app/data
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
