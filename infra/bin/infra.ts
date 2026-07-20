#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EcrStack } from '../lib/ecr-stack';
import { MelduoAppStack } from '../lib/infra-stack';

const app = new cdk.App();

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };

// Stack 1: ECR repository (no image dependency — safe to deploy first)
const ecrStack = new EcrStack(app, 'melduo-app-cmrohlgz-ecr', { env });

// Stack 2: App Runner service + IAM roles (requires an image in ECR)
// Must be deployed AFTER an image has been pushed to ecrStack.repository.
new MelduoAppStack(app, 'melduo-app-cmrohlgz', {
  env,
  repository: ecrStack.repository,
});
