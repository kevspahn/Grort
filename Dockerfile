# Stage 1: Build Expo web
FROM node:22 AS web-build
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ .
RUN npx expo export --platform web

# Stage 2: Backend + static files
FROM node:22-slim
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ .
COPY --from=web-build /mobile/dist /app/public
RUN mkdir -p uploads

EXPOSE 3001
ENV PORT=3001

CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/index.ts"]
