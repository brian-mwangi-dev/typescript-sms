#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MelduoAppStack } from '../lib/infra-stack';

const app = new cdk.App();
new MelduoAppStack(app, 'melduo-app-cmrohlgz', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
});
