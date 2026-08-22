FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp \
    TMPDIR=/tmp
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/standalone ./
# Vinext's standalone tracer currently misses React's server runtime packages.
# Keep the runtime image minimal while supplying the exact packages it imports.
COPY --from=build --chown=node:node /app/node_modules/react ./node_modules/react
COPY --from=build --chown=node:node /app/node_modules/react-dom ./node_modules/react-dom
COPY --from=build --chown=node:node /app/node_modules/react-is ./node_modules/react-is
COPY --from=build --chown=node:node /app/node_modules/react-server-dom-webpack ./node_modules/react-server-dom-webpack
COPY --from=build --chown=node:node /app/node_modules/scheduler ./node_modules/scheduler
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
