#!/bin/sh
set -e

# Convert Windows line endings to Unix (just in case)
sed -i 's/\r$//' "$0"

HOST=${DB_HOST:-postgres}
PORT=${DB_PORT:-5432}

echo "Waiting for PostgreSQL at $HOST:$PORT..."

retries=0
while ! nc -z -w 2 $HOST $PORT; do
  retries=$((retries+1))
  echo "⏳ PostgreSQL is unavailable - attempt $retries..."
  
  if [ $retries -gt 30 ]; then
      echo "❌ Could not connect to PostgreSQL after 30 attempts."
      exit 1
  fi
  
  sleep 2
done

echo "✅ PostgreSQL is up - executing schema push"
npx prisma db push --accept-data-loss

echo "🚀 Starting backend on port 5000..."
export PORT=5000
npm start
