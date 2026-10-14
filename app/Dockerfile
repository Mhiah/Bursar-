# Bursar on Railway (or any Docker host): the website, its API and the agent's timer in one process.
FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# Values the browser needs are baked in at build time. Railway passes service variables in as build args.
ARG NEXT_PUBLIC_BURSAR_NETWORK=mainnet
ARG NEXT_PUBLIC_FACTORY_ADDRESS
ARG NEXT_PUBLIC_SAVINGS_FACTORY_ADDRESS
ARG NEXT_PUBLIC_AGENT_ADDRESS
ARG NEXT_PUBLIC_AGENT_EVERY_MINUTES
ENV NEXT_PUBLIC_BURSAR_NETWORK=$NEXT_PUBLIC_BURSAR_NETWORK \
    NEXT_PUBLIC_FACTORY_ADDRESS=$NEXT_PUBLIC_FACTORY_ADDRESS \
    NEXT_PUBLIC_SAVINGS_FACTORY_ADDRESS=$NEXT_PUBLIC_SAVINGS_FACTORY_ADDRESS \
    NEXT_PUBLIC_AGENT_ADDRESS=$NEXT_PUBLIC_AGENT_ADDRESS \
    NEXT_PUBLIC_AGENT_EVERY_MINUTES=$NEXT_PUBLIC_AGENT_EVERY_MINUTES
RUN npm run build

# Keep the database and the Circle agent wallet's login on the mounted volume, so they survive redeploys.
ENV NODE_ENV=production \
    BURSAR_DATA_DIR=/data/pglite \
    CIRCLE_CLI_HOME=/data/circle
CMD ["npm", "start"]
