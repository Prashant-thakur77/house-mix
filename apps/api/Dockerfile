# Build context: repository root.  docker build -f apps/api/Dockerfile .
FROM node:22.19-bookworm-slim
ENV NODE_ENV=production
RUN npm install --global @qloo/qloo-harness@^0.1.26 && qloo --version
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY eval/package.json eval/
RUN npm ci --workspace @housemix/api --workspace @housemix/shared --include-workspace-root=false --omit=dev --ignore-scripts \
 && npm cache clean --force
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY fixtures fixtures
COPY eval/ab_blind eval/ab_blind
RUN groupadd --system app && useradd --system --gid app --home /home/app --create-home app \
 && mkdir -p /app/data && chown -R app:app /app/data /home/app
USER app
ENV HOME=/home/app QLOO_HOME=/home/app/.qloo PORT=8080 HM_DATA_DIR=/app/data
EXPOSE 8080
WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/server.ts"]
