FROM node:20-alpine

WORKDIR /app

# Install netcat (wait for Postgres), wget (healthcheck), and postgresql tools for backups
RUN apk add --no-cache openssl netcat-openbsd wget postgresql-client gzip

# Copy package files and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy all backend files
COPY . .

# Ensure start.sh has execute permissions
RUN chmod +x start.sh

# Convert Windows CRLF to Unix LF inside the container
RUN sed -i 's/\r$//' start.sh

# Generate Prisma client
RUN npx prisma generate

# Build the backend (if you have a build step)
RUN npm run build

# Expose backend port
EXPOSE 5000

# Start the backend
CMD ["./start.sh"]