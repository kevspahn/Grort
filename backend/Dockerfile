FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN mkdir -p uploads

EXPOSE 3001
ENV PORT=3001

CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/index.ts"]
