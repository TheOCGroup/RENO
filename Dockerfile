FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./package.json
COPY src ./src
COPY lib ./lib
USER node
EXPOSE 8080
CMD ["node", "src/renovisionMain.mjs"]
