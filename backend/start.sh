#!/bin/sh
set -e

HOST=${DB_HOST:-postgres}
PORT=${DB_PORT:-5432}
MAX_ATTEMPTS=${DB_WAIT_ATTEMPTS:-60}
SLEEP_SECS=${DB_WAIT_SLEEP:-3}

# Try TCP connect using Node (reliable in Alpine; nc -z can be flaky)
try_connect() {
  node -e "
    const net = require('net');
    const s = net.connect($PORT, '$HOST', () => { s.destroy(); process.exit(0); });
    s.on('error', () => process.exit(1));
    s.setTimeout(4000, () => { s.destroy(); process.exit(1); });
  " 2>/dev/null
}

echo "Waiting for PostgreSQL at $HOST:$PORT (max ${MAX_ATTEMPTS} attempts, ${SLEEP_SECS}s apart)..."

# Give Postgres a head start on first boot (initdb can take 15–45s)
sleep 5

retries=0
while ! try_connect; do
  retries=$((retries+1))
  echo "⏳ PostgreSQL is unavailable - attempt $retries/$MAX_ATTEMPTS..."
  
  if [ "$retries" -ge "$MAX_ATTEMPTS" ]; then
      echo "❌ Could not connect to PostgreSQL after $MAX_ATTEMPTS attempts."
      echo "   Check: docker compose ps (postgres running?) and docker compose logs postgres"
      echo "   If postgres is healthy but backend still times out, host firewall may block container-to-container traffic."
      echo "   Compose should set DB_HOST=host.docker.internal to use the host's published port instead."
      exit 1
  fi
  
  sleep "$SLEEP_SECS"
done

echo "✅ PostgreSQL is up - testing DATABASE_URL auth..."
node -e "
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.connect()
    .then(() => { console.log('✅ DB auth OK'); c.end(); process.exit(0); })
    .catch(e => { console.error('❌ DB auth FAILED:', e.message); process.exit(1); });
" || exit 1

echo "🔧 Executing schema push..."
npx prisma db push --accept-data-loss

echo "🚀 Starting backend on port 5000..."
export PORT=5000
npm start