import tarfile, os, gzip, hashlib, io, json, boto3, time, datetime
import sys
SC=os.path.dirname(os.path.abspath(__file__)); R=os.path.abspath(os.path.join(SC,'..','..'))
TAG=sys.argv[1] if len(sys.argv)>1 else None  # rollback tag for what is live now, e.g. app-before-deploy-7
assert TAG, 'usage: python3 scripts/test-deploy/deploy_overlay.py app-before-deploy-N'
S=R+'/.next/standalone'
def skip(rel):
    parts=rel.split(os.sep)
    return parts[0] in {'.env','.uploads'} or rel.startswith('node_modules/@img')
entries=[]
def add_tree(src,dest,sk=None):
    for root,dirs,files in os.walk(src):
        for f in files:
            p=os.path.join(root,f); rel=os.path.relpath(p,src)
            if sk and sk(rel): continue
            entries.append((os.path.join(dest,rel) if dest else rel,p))
add_tree(S,'',skip); add_tree(R+'/.next/static','.next/static'); add_tree(R+'/public','public'); add_tree(R+'/prisma','prisma')
entries.append(('entrypoint.sh',R+'/scripts/docker-entrypoint.sh'))
bad=[a for a,_ in entries if a.endswith('.env') or '/.env' in a or a.startswith('.uploads') or '@img' in a]
assert not bad, bad
buf=io.BytesIO()
with tarfile.open(fileobj=buf,mode='w',format=tarfile.PAX_FORMAT) as t:
    for arc,p in sorted(entries):
        ti=t.gettarinfo(p,arcname='app/'+arc); ti.uid=ti.gid=0; ti.uname=ti.gname=''; ti.mtime=int(time.time())
        ti.mode=0o755 if (arc=='entrypoint.sh' or os.access(p,os.X_OK)) else 0o644
        with open(p,'rb') as fh: t.addfile(ti,fh)
raw=buf.getvalue(); diff_id='sha256:'+hashlib.sha256(raw).hexdigest()
gz=gzip.compress(raw,compresslevel=6,mtime=0); layer_digest='sha256:'+hashlib.sha256(gz).hexdigest()
print(len(entries),'files',len(gz)//1024//1024,'MB gz')
ecr=boto3.client('ecr',region_name='eu-north-1')
def _hash(request, **kw):
    body=request.body if isinstance(request.body,(bytes,bytearray)) else (request.body or b'')
    if isinstance(body,str): body=body.encode()
    request.headers['X-Amz-Content-Sha256']=hashlib.sha256(body).hexdigest()
ecr.meta.events.register('before-sign.ecr.*',_hash)
def upload(data,digest):
    up=ecr.initiate_layer_upload(repositoryName='eci-hub'); uid=up['uploadId']; part=10*1024*1024; pos=0
    while True:
        chunk=data[pos:pos+part]
        ecr.upload_layer_part(repositoryName='eci-hub',uploadId=uid,partFirstByte=pos,partLastByte=pos+len(chunk)-1,layerPartBlob=chunk); pos+=len(chunk)
        if pos>=len(data): break
    ecr.complete_layer_upload(repositoryName='eci-hub',uploadId=uid,layerDigests=[digest])
# rollback copy of what is live now
cur=ecr.batch_get_image(repositoryName='eci-hub',imageIds=[{'imageTag':'app'}],acceptedMediaTypes=['application/vnd.oci.image.manifest.v1+json'])['images'][0]['imageManifest']
ecr.put_image(repositoryName='eci-hub',imageManifest=cur,imageManifestMediaType='application/vnd.oci.image.manifest.v1+json',imageTag=TAG); print('tagged',TAG)
# base = the image from before any overlay (app-previous), config saved earlier
old_m=json.load(open(SC+'/app-manifest.json')); old_c=json.load(open(SC+'/app-config.json'))  # base image = tag app-previous (31 layers)
assert len(old_m['layers'])==len(old_c['rootfs']['diff_ids'])==31
now=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
c=json.loads(json.dumps(old_c)); c['rootfs']['diff_ids'].append(diff_id); c['created']=now
c.setdefault('history',[]).append({'created':now,'created_by':'ECI-Hub test deploy: app code overlay'})
cfg=json.dumps(c,separators=(',',':')).encode(); cfg_digest='sha256:'+hashlib.sha256(cfg).hexdigest()
m=json.loads(json.dumps(old_m)); m['config']={'mediaType':old_m['config']['mediaType'],'digest':cfg_digest,'size':len(cfg)}
m['layers'].append({'mediaType':old_m['layers'][0]['mediaType'],'digest':layer_digest,'size':len(gz)})
upload(cfg,cfg_digest); upload(gz,layer_digest); print('uploaded')
r=ecr.put_image(repositoryName='eci-hub',imageManifest=json.dumps(m),imageManifestMediaType=old_m['mediaType'],imageTag='app')
print('tagged app ->',r['image']['imageId']['imageDigest'][:19])
