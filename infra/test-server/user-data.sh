#!/bin/bash
# First-boot setup for the ECI-Hub test server (Amazon Linux 2023, ARM).
# Installs Docker, adds swap, and creates local secrets that never leave the server.
set -euxo pipefail
dnf install -y docker
systemctl enable --now docker
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
mkdir -p /opt/eci && chmod 700 /opt/eci
if [ ! -f /opt/eci/.env ]; then
  umask 077
  printf 'PGPW=%s\nAUTH_SECRET=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 24)" > /opt/eci/.env
fi
