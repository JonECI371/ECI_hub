import * as path from 'path';
import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

export interface EciHubStackProps extends StackProps {
  stage: 'staging' | 'production';
  domainName?: string;
  certificateArn?: string;
}

/**
 * Everything the platform needs in one stack per stage:
 * VPC (no NAT, to keep cost down), Postgres on RDS, two S3 buckets,
 * an app secret for integration keys, and the Next.js app on Fargate behind a load balancer.
 */
export class EciHubStack extends Stack {
  constructor(scope: Construct, id: string, props: EciHubStackProps) {
    super(scope, id, props);
    const prod = props.stage === 'production';

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    // ---------- Database ----------
    const dbSg = new ec2.SecurityGroup(this, 'DbSg', { vpc, description: 'Postgres, app access only' });
    const database = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, prod ? ec2.InstanceSize.SMALL : ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      databaseName: 'eci',
      credentials: rds.Credentials.fromGeneratedSecret('eci_admin'),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      multiAz: false,
      backupRetention: Duration.days(prod ? 30 : 7),
      deletionProtection: prod,
      removalPolicy: prod ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
    });

    // ---------- Files ----------
    const common: s3.BucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !prod,
    };
    const files = new s3.Bucket(this, 'Files', { ...common, versioned: prod });
    // Photo ID and passport photos: deleted automatically after 30 days (spec: Data protection).
    const idDocs = new s3.Bucket(this, 'IdDocs', { ...common, lifecycleRules: [{ expiration: Duration.days(30) }] });

    // ---------- App secrets (fill in the AWS console after first deploy) ----------
    const appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      secretName: `eci-hub/${props.stage}/app`,
      description: 'Stripe, Microsoft Graph and auth keys as JSON',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '',
          MS_TENANT_ID: '', MS_CLIENT_ID: '', MS_CLIENT_SECRET: '',
        }),
        generateStringKey: 'AUTH_SECRET',
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    // ---------- App on Fargate ----------
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, containerInsights: prod });
    const siteUrl = props.domainName ? `https://${props.domainName}` : '';
    const dbSecret = database.secret!;
    const certificate = props.certificateArn ? acm.Certificate.fromCertificateArn(this, 'Cert', props.certificateArn) : undefined;

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'App', {
      cluster,
      cpu: prod ? 1024 : 512,
      memoryLimitMiB: prod ? 2048 : 1024,
      desiredCount: prod ? 2 : 1,
      minHealthyPercent: prod ? 50 : 100,
      // Graviton (ARM) is cheaper; the image is built for ARM to match, on any Mac.
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
      assignPublicIp: true, // public subnets, no NAT gateway
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publicLoadBalancer: true,
      certificate,
      redirectHTTP: !!certificate,
      protocol: certificate ? elbv2.ApplicationProtocol.HTTPS : elbv2.ApplicationProtocol.HTTP,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, '..', '..'), { platform: Platform.LINUX_ARM64 }),
        containerPort: 3000,
        environment: {
          NODE_ENV: 'production',
          SITE_URL: siteUrl,
          AWS_REGION: this.region,
          DB_NAME: 'eci',
          FILES_BUCKET: files.bucketName,
          ID_DOCS_BUCKET: idDocs.bucketName,
          EMAIL_FROM: 'bookings@eci-hub.co.uk',
          MS_MEETING_HOST: 'training@eci-hub.co.uk',
        },
        secrets: {
          DB_HOST: ecs.Secret.fromSecretsManager(dbSecret, 'host'),
          DB_PORT: ecs.Secret.fromSecretsManager(dbSecret, 'port'),
          DB_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
          AUTH_SECRET: ecs.Secret.fromSecretsManager(appSecret, 'AUTH_SECRET'),
          STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(appSecret, 'STRIPE_SECRET_KEY'),
          STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(appSecret, 'STRIPE_WEBHOOK_SECRET'),
          MS_TENANT_ID: ecs.Secret.fromSecretsManager(appSecret, 'MS_TENANT_ID'),
          MS_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecret, 'MS_CLIENT_ID'),
          MS_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecret, 'MS_CLIENT_SECRET'),
        },
      },
    });
    service.targetGroup.configureHealthCheck({ path: '/api/health', healthyHttpCodes: '200', interval: Duration.seconds(30) });
    dbSg.addIngressRule(service.service.connections.securityGroups[0], ec2.Port.tcp(5432), 'App to Postgres');

    files.grantReadWrite(service.taskDefinition.taskRole);
    idDocs.grantReadWrite(service.taskDefinition.taskRole);
    service.taskDefinition.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    const scaling = service.service.autoScaleTaskCount({ minCapacity: prod ? 2 : 1, maxCapacity: prod ? 4 : 1 });
    scaling.scaleOnCpuUtilization('Cpu', { targetUtilizationPercent: 60 });

    new CfnOutput(this, 'AppUrl', { value: siteUrl || `http://${service.loadBalancer.loadBalancerDnsName}` });
    new CfnOutput(this, 'LoadBalancerDns', { value: service.loadBalancer.loadBalancerDnsName });
    new CfnOutput(this, 'AppSecretName', { value: appSecret.secretName });
    new CfnOutput(this, 'DbSecretName', { value: dbSecret.secretName });
  }
}
