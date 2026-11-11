"""Push one platform manifest from an OCI layout to ECR using the ECR API (no docker login).
Usage: python3 ecr_push.py <oci-dir> <manifest-digest> <repo> <tag> <region>"""
import json, os, sys
import boto3

oci, mdigest, repo, tag, region = sys.argv[1:6]
ecr = boto3.client('ecr', region_name=region)
import hashlib
def _hash(request, **kw):
    body = request.body if isinstance(request.body, (bytes, bytearray)) else (request.body or b'')
    if isinstance(body, str): body = body.encode()
    request.headers['X-Amz-Content-Sha256'] = hashlib.sha256(body).hexdigest()
ecr.meta.events.register('before-sign.ecr.*', _hash)
blob = lambda d: os.path.join(oci, 'blobs', 'sha256', d.split(':')[1])

raw = open(blob(mdigest), 'rb').read()
manifest = json.loads(raw)
digests = [manifest['config']['digest']] + [l['digest'] for l in manifest['layers']]

avail = {}
for i in range(0, len(digests), 100):
    r = ecr.batch_check_layer_availability(repositoryName=repo, layerDigests=digests[i:i + 100])
    for l in r.get('layers', []):
        avail[l['layerDigest']] = l.get('layerAvailability') == 'AVAILABLE'

for d in digests:
    if avail.get(d):
        print('exists', d[:19], flush=True)
        continue
    path = blob(d)
    size = os.path.getsize(path)
    up = ecr.initiate_layer_upload(repositoryName=repo)
    uid, part = up['uploadId'], up['partSize']
    part = max(part, 5 * 1024 * 1024)
    part = min(part, 10 * 1024 * 1024)
    with open(path, 'rb') as f:
        pos = 0
        while pos < size:
            chunk = f.read(part)
            ecr.upload_layer_part(repositoryName=repo, uploadId=uid, partFirstByte=pos, partLastByte=pos + len(chunk) - 1, layerPartBlob=chunk)
            pos += len(chunk)
    ecr.complete_layer_upload(repositoryName=repo, uploadId=uid, layerDigests=[d])
    print('uploaded', d[:19], f'{size / 1e6:.1f}MB', flush=True)

ecr.put_image(repositoryName=repo, imageManifest=raw.decode(), imageManifestMediaType=manifest.get('mediaType', 'application/vnd.oci.image.manifest.v1+json'), imageTag=tag, imageDigest=mdigest)
print('tagged', tag)
