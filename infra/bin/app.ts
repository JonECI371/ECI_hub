#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { EciHubStack } from '../lib/eci-hub-stack';

const app = new App();
const region = app.node.tryGetContext('region') ?? 'eu-west-2';
const account = process.env.CDK_DEFAULT_ACCOUNT;

for (const stage of ['staging', 'production'] as const) {
  const ctx = app.node.tryGetContext(stage) ?? {};
  new EciHubStack(app, `EciHub-${stage}`, {
    env: { account, region },
    stage,
    domainName: ctx.domainName || undefined,
    certificateArn: ctx.certificateArn || undefined,
  });
}
