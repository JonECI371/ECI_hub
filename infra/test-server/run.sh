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
# Microsoft 365 (Teams invites): IDs in /opt/eci/ms.env, secret read from Secrets Manager at start.
MS_TENANT_ID=""; MS_CLIENT_ID=""; MS_MEETING_HOST=""; MS_INVITE_ALLOWLIST="@ecfio.co.uk,@eci-hub.co.uk"; MS_SECRET_ID=""
[ -f /opt/eci/ms.env ] && source /opt/eci/ms.env
MS_CLIENT_SECRET=""
# Stripe: publishable key and secret name in /opt/eci/stripe.env; card payments switch on once the secret is readable.
STRIPE_PUBLISHABLE_KEY=""; STRIPE_SECRET_ID=""; STRIPE_SECRET_KEY=""; STRIPE_WEBHOOK_SECRET=""; PAYMENTS_MODE="test"
[ -f /opt/eci/stripe.env ] && source /opt/eci/stripe.env
if [ -n "$STRIPE_SECRET_ID" ]; then
  STRIPE_JSON=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$STRIPE_SECRET_ID" --query SecretString --output text 2>/dev/null || true)
  STRIPE_SECRET_KEY=$(echo "$STRIPE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("STRIPE_SECRET_KEY",""))' 2>/dev/null || true)
  STRIPE_WEBHOOK_SECRET=$(echo "$STRIPE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("STRIPE_WEBHOOK_SECRET",""))' 2>/dev/null || true)
  [ -n "$STRIPE_SECRET_KEY" ] && [ -n "$STRIPE_PUBLISHABLE_KEY" ] && PAYMENTS_MODE="stripe"
fi
# Xero: secret name in /opt/eci/xero.env (XERO_SECRET_ID); the secret holds XERO_CLIENT_ID and XERO_CLIENT_SECRET.
XERO_SECRET_ID=""; XERO_CLIENT_ID=""; XERO_CLIENT_SECRET=""
[ -f /opt/eci/xero.env ] && source /opt/eci/xero.env
if [ -n "$XERO_SECRET_ID" ]; then
  XERO_JSON=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$XERO_SECRET_ID" --query SecretString --output text 2>/dev/null || true)
  XERO_CLIENT_ID=$(echo "$XERO_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("XERO_CLIENT_ID",""))' 2>/dev/null || true)
  XERO_CLIENT_SECRET=$(echo "$XERO_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("XERO_CLIENT_SECRET",""))' 2>/dev/null || true)
fi
if [ -n "$MS_SECRET_ID" ]; then
  MS_CLIENT_SECRET=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$MS_SECRET_ID" --query SecretString --output text 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("MS_CLIENT_SECRET",""))' 2>/dev/null || true)
fi
docker pull "$REG/eci-hub:app"
docker rm -f app >/dev/null 2>&1 || true
docker run -d --name app --network eci --restart always -p 80:3000 \
  -e DATABASE_URL="$DBURL" -e SITE_URL="$SITE" -e AUTH_SECRET="$AUTH_SECRET" -e NODE_ENV=production \
  -e EMAIL_FROM=bookings@eci-hub.co.uk -e AWS_REGION="$REGION" \
  -e LOCAL_UPLOAD_DIR=/data/uploads -v eci-uploads:/data/uploads -e RUN_JOBS=1 \
  -e MS_TENANT_ID="$MS_TENANT_ID" -e MS_CLIENT_ID="$MS_CLIENT_ID" -e MS_CLIENT_SECRET="$MS_CLIENT_SECRET" \
  -e MS_MEETING_HOST="$MS_MEETING_HOST" -e MS_INVITE_ALLOWLIST="$MS_INVITE_ALLOWLIST" \
  -e PAYMENTS_MODE="$PAYMENTS_MODE" -e STRIPE_PUBLISHABLE_KEY="$STRIPE_PUBLISHABLE_KEY" -e STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" -e STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" -e XERO_CLIENT_ID="$XERO_CLIENT_ID" -e XERO_CLIENT_SECRET="$XERO_CLIENT_SECRET" \
  "$REG/eci-hub:app"
if [ "$SEED" = "seed" ]; then
  sleep 10   # let the app apply migrations first
  docker pull "$REG/eci-hub:tools"
  docker run --rm --network eci -e DATABASE_URL="$DBURL" -e SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-}" "$REG/eci-hub:tools" npx tsx prisma/seed.ts
fi
docker image prune -f >/dev/null
echo "running"
