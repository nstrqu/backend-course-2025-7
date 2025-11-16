FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "main.js", "-h", "0.0.0.0", "-p", "3000", "-c", "cache"]

EXPOSE 3000
