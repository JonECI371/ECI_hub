#!/bin/bash
# Bring the local dev stack back after a machine restart: Docker, Postgres, the app.
S="${SCRATCH:-/tmp/eci-hub-deploy}"; mkdir -p "$S"  # working folder for build output; copy the other tools here too
cd /home/user/eci-hub-platform-src/eci-hub-platform
docker info >/dev/null 2>&1 || { pkill containerd 2>/dev/null; sleep 1; rm -f /var/run/docker/containerd/containerd.pid; (nohup dockerd > $S/dockerd.log 2>&1 &); for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done; }
docker compose up -d >/dev/null 2>&1; for i in $(seq 1 20); do docker compose exec -T db pg_isready -U eci >/dev/null 2>&1 && break; sleep 1; done
npx prisma migrate deploy >/dev/null 2>&1
if [ "$1" = "build" ] || [ ! -f .next/BUILD_ID ]; then npm run build > $S/nextbuild.log 2>&1 || { tail -20 $S/nextbuild.log; exit 1; }; fi
pkill -f "next start" 2>/dev/null; pkill -f next-server 2>/dev/null; sleep 1
(nohup npm run start -- -p 3000 > $S/app.log 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null localhost:3000/api/health && break; sleep 1; done
echo "up: $(curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/health)"
