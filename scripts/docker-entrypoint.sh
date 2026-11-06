#!/bin/sh
set -e
# On AWS the database credentials arrive as separate secrets; build the URL Prisma needs.
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  PW=$(node -e 'process.stdout.write(encodeURIComponent(process.env.DB_PASSWORD))')
  export DATABASE_URL="postgresql://${DB_USER}:${PW}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-eci}?sslmode=require"
fi
# Apply any pending migrations, then start the server.
node node_modules/prisma/build/index.js migrate deploy
exec node server.js
