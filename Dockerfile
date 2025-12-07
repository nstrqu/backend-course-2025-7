FROM node:20

# Папка всередині контейнера
WORKDIR /app

# Спочатку копіюємо тільки package.json та package-lock.json
COPY package*.json ./

# Встановлюємо залежності
RUN npm install

# Копіюємо весь проект
COPY . .

# Вказуємо порт для контейнера
EXPOSE 3000

# Команда запуску (поки без nodemon)
CMD ["npm", "run", "dev"]
