#!/bin/bash
# Used by buildspec.yml after the images are pushed: puts the latest run.sh on the test server and restarts it
# through SSM (no ports open, no SSH), then prints the health checks. Same steps as the old hand-run deploy.
set -euo pipefail
REGION="${AWS_REGION:-eu-north-1}"
INSTANCE="${TEST_INSTANCE_ID:-i-0567b0e02843cb540}"
REGISTRY="${ECR_REGISTRY:?ECR_REGISTRY is not set}"
SITE="${TEST_SITE_URL:-https://test.eci-hub.co.uk}"
B64=$(base64 -w0 infra/test-server/run.sh)
C0=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters "commands=[\"echo $B64 | base64 -d > /opt/eci/run.sh && chmod 700 /opt/eci/run.sh\"]" --query Command.CommandId --output text)
aws ssm wait command-executed --region "$REGION" --command-id "$C0" --instance-id "$INSTANCE" || true
HOST="${SITE#https://}"
CID=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript --timeout-seconds 1800 \
  --parameters "commands=[\"SEED_ADMIN_EMAIL=jon@ecfio.co.uk /opt/eci/run.sh $REGISTRY $SITE 2>&1 | tail -3\",\"sleep 25; for p in / /courses /login /api/health; do echo \\\"\$p \$(curl -sk -o /dev/null -w %{http_code} --resolve $HOST:443:127.0.0.1 $SITE\$p)\\\"; done\"],executionTimeout=[\"1800\"]" \
  --query Command.CommandId --output text)
for i in $(seq 1 80); do
  ST=$(aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || true)
  case "$ST" in Success|Failed|Cancelled|TimedOut) break ;; esac
  sleep 15
done
aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$INSTANCE" --query '[Status,StandardOutputContent]' --output text | tail -8
[ "$ST" = "Success" ] || { echo "Restart did not succeed ($ST)"; exit 1; }
