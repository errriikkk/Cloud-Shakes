FROM node:20-alpine

WORKDIR /app

# Install netcat (wait for Postgres), wget (healthcheck), postgresql tools for backups, and ClamAV for antivirus
RUN apk add --no-cache openssl netcat-openbsd wget postgresql-client gzip clamav clamav-db freshclam

# Configure ClamAV to not start daemon automatically (we'll use clamscan directly)
RUN freshclam || true && \
    sed -i 's/^Foreground yes$/Foreground no/' /etc/clamav/clamd.conf || true && \
    mkdir -p /var/run/clamav && \
    chown -R clamav:clamav /var/run/clamav /var/lib/clamav

# Copy package files and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including web-push for push notifications)
RUN npm install web-push --save
RUN npm install --save-dev @types/web-push

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