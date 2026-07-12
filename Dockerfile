# Stage 1: Build Expo web
FROM node:22 AS web-build
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ .
ENV EXPO_PUBLIC_API_URL=""
RUN npx expo export --platform web

# Stage 2: Compile the backend (typecheck + emit dist/)
FROM node:22 AS api-build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ .
RUN npm run build
# tsc does not copy non-TS assets; migrations must live alongside the compiled JS
RUN cp -r src/db/migrations dist/db/migrations

# Stage 3: Runtime — production deps only, compiled JS, non-root
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=api-build /app/dist ./dist
COPY --from=web-build /mobile/dist ./public
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
