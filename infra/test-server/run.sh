#!/bin/bash
# (Re)start the app on the test server: Postgres + the app image from ECR.
# Usage on the server: run.sh <ecr-registry> <site-url> [seed]
set -euo pipefail
REG="$1"; SITE="$2"; SEED="${3:-}"
REGION="$(echo "$REG" | cut -d. -f4)"
source /opt/eci/.env
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REG" >/dev/null
docker network inspect eci >/dev/null 2>&1 || docker network create eci
if ! docker ps -a --format '{{.Names}}' | grep -qx db; then
  docker run -d --name db --network eci --restart always \
    -e POSTGRES_USER=eci -e POSTGRES_PASSWORD="$PGPW" -e POSTGRES_DB=eci \
    -v eci-pg:/var/lib/postgresql/data postgres:16
  sleep 8
fi
DBURL="postgresql://eci:${PGPW}@db:5432/eci"
docker pull "$REG/eci-hub:app"
docker rm -f app >/dev/null 2>&1 || true
docker run -d --name app --network eci --restart always -p 80:3000 \
  -e DATABASE_URL="$DBURL" -e SITE_URL="$SITE" -e AUTH_SECRET="$AUTH_SECRET" -e NODE_ENV=production \
  -e EMAIL_FROM=bookings@eci-hub.co.uk -e AWS_REGION="$REGION" \
  "$REG/eci-hub:app"
if [ "$SEED" = "seed" ]; then
  sleep 10   # let the app apply migrations first
  docker pull "$REG/eci-hub:tools"
  docker run --rm --network eci -e DATABASE_URL="$DBURL" "$REG/eci-hub:tools" npx tsx prisma/seed.ts
fi
docker image prune -f >/dev/null
echo "running"
