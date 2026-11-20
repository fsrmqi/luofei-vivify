FROM node:22-alpine
WORKDIR /app
COPY public/ ./public/
COPY server/server.ts ./server/server.ts
ENV VIVIFY_CONTAINER=1
USER node
EXPOSE 4313
CMD ["node", "server/server.ts"]
