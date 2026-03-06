FROM node:20-alpine

WORKDIR /app

# Install netcat for wait-for-it functionality
RUN apk add --no-cache openssl netcat-openbsd

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

# Ensure start.sh has execute permissions
RUN chmod +x start.sh

RUN npx prisma generate
RUN npm run build

EXPOSE 5000

CMD ["./start.sh"]
