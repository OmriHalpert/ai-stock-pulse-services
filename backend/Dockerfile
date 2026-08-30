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

# Amazon RDS CA (eu-west-1). NODE_EXTRA_CA_CERTS appends to the default
# trust store so sslmode=verify-full can validate the RDS server cert.
ADD https://truststore.pki.rds.amazonaws.com/eu-west-1/eu-west-1-bundle.pem \
    /etc/ssl/certs/rds-eu-west-1-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-eu-west-1-bundle.pem

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
