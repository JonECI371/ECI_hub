import boto3,time,sys,json
def run(cmds, comment, timeout=900):
    s=boto3.Session(region_name='eu-north-1'); ssm=s.client('ssm')
    r=ssm.send_command(InstanceIds=['i-0567b0e02843cb540'],DocumentName='AWS-RunShellScript',Parameters={'commands':cmds,'executionTimeout':[str(timeout)]},Comment=comment,TimeoutSeconds=timeout)
    cid=r['Command']['CommandId']
    for _ in range(timeout//5):
        time.sleep(5)
        o=ssm.get_command_invocation(CommandId=cid,InstanceId='i-0567b0e02843cb540')
        if o['Status'] not in('Pending','InProgress','Delayed'): break
    return o['Status'], o['StandardOutputContent'], o['StandardErrorContent']
