FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY public ./public
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/index.js"]
