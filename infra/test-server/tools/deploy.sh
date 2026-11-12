#!/bin/bash
# Build the current commit for ARM, upload to ECR (eu-north-1) and restart the test server.
set -e
S=/tmp/claude-0/-home-user/5147478d-0c46-5f67-b65d-56a16e8c4224/scratchpad
REPO=/home/user/eci-hub-platform-src/eci-hub-platform
export AWS_DEFAULT_REGION=eu-north-1
docker info >/dev/null 2>&1 || { pkill containerd 2>/dev/null || true; sleep 1; rm -f /var/run/docker/containerd/containerd.pid; (nohup dockerd > $S/dockerd.log 2>&1 &); for i in $(seq 1 40); do docker info >/dev/null 2>&1 && break; sleep 1; done; }
[ -e /proc/sys/fs/binfmt_misc/register ] || mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc
docker run --privileged --rm tonistiigi/binfmt --install arm64 >/dev/null 2>&1 || true
docker run --rm --platform linux/arm64 alpine uname -m | grep -q aarch64
echo "[1/4] copying source"; rm -rf $S/ctx3 && mkdir -p $S/ctx3 && cd $REPO && git ls-files -z | xargs -0 -I{} cp --parents {} $S/ctx3/
cp /root/.ccr/ca-bundle.crt $S/ctx3/proxy-ca.crt
cp $S/Dockerfile.sandbox $S/ctx3/Dockerfile.sandbox
P="$HTTPS_PROXY"; A="--network host --platform linux/arm64 -f Dockerfile.sandbox --build-arg HTTP_PROXY=$P --build-arg HTTPS_PROXY=$P --build-arg http_proxy=$P --build-arg https_proxy=$P --build-arg NO_PROXY=$NO_PROXY --build-arg no_proxy=$NO_PROXY"
cd $S/ctx3
echo "[2/4] building app image"; docker build $A -t eci-hub:app . > $S/deploy-build.log 2>&1
echo "[2/4] building tools image"; docker build $A --target build -t eci-hub:tools .
# keep a base image for the next build
docker image inspect eci-base:node22 >/dev/null 2>&1 || true >> $S/deploy-build.log 2>&1
for t in app tools; do
  echo "[3/4] uploading $t"
  rm -rf $S/oci-$t-x && mkdir -p $S/oci-$t-x && (cd $S/oci-$t-x && docker save eci-hub:$t | tar x)
  D=$(python3 -I -c "
import json,sys;o=sys.argv[1];i=json.load(open(o+'/index.json'));d=i['manifests'][0]['digest'].split(':')[1];m=json.load(open(o+'/blobs/sha256/'+d))
print([x['digest'] for x in m['manifests'] if x.get('platform',{}).get('architecture')=='arm64'][0] if 'manifests' in m else i['manifests'][0]['digest'])" $S/oci-$t-x)
  (cd /home/user && python3 -I $S/ecr_push.py $S/oci-$t-x $D eci-hub $t eu-north-1 | grep -v exists | tail -2)
done
echo "[4/4] restarting server"
B64=$(base64 -w0 $REPO/infra/test-server/run.sh)
C0=$(aws ssm send-command --instance-ids i-0567b0e02843cb540 --document-name AWS-RunShellScript --parameters "commands=[\"echo $B64 | base64 -d > /opt/eci/run.sh && chmod 700 /opt/eci/run.sh\"]" --query Command.CommandId --output text); sleep 5
aws ssm wait command-executed --command-id $C0 --instance-id i-0567b0e02843cb540 || true
CID=$(aws ssm send-command --instance-ids i-0567b0e02843cb540 --document-name AWS-RunShellScript --timeout-seconds 1800 --parameters 'commands=["SEED_ADMIN_EMAIL=jon@ecfio.co.uk /opt/eci/run.sh 992868470990.dkr.ecr.eu-north-1.amazonaws.com https://test.eci-hub.co.uk seed 2>&1 | tail -3","sleep 25; for p in / /courses /login /api/health; do echo \"$p $(curl -sk -o /dev/null -w %{http_code} --resolve test.eci-hub.co.uk:443:127.0.0.1 https://test.eci-hub.co.uk$p)\"; done"],executionTimeout=["1800"]' --query Command.CommandId --output text)
for i in $(seq 1 80); do St=$(aws ssm get-command-invocation --command-id $CID --instance-id i-0567b0e02843cb540 --query Status --output text 2>/dev/null || true); case $St in Success|Failed|Cancelled|TimedOut) break;; esac; sleep 15; done
aws ssm get-command-invocation --command-id $CID --instance-id i-0567b0e02843cb540 --query '[Status,StandardOutputContent]' --output text | tail -8
rm -rf $S/oci-app-x $S/oci-tools-x; docker builder prune -f --keep-storage 5GB >/dev/null 2>&1 || true
echo DEPLOYED
