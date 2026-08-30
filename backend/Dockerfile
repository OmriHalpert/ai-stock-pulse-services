FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk upgrade --no-cache
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Keep the bundle under /app so USER node can read it. apk upgrade
# leaves /etc/ssl/certs unreadable to non-root on Alpine.
ADD https://truststore.pki.rds.amazonaws.com/eu-west-1/eu-west-1-bundle.pem \
    /app/certs/rds-eu-west-1-bundle.pem
RUN chmod 644 /app/certs/rds-eu-west-1-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/rds-eu-west-1-bundle.pem

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
