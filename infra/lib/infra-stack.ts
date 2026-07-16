import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import { Service, Source, Secret } from '@aws-cdk/aws-apprunner-alpha';

// Declare every SSM parameter name ONCE — never retypes these literals below.
const SSM_PARAM_NAMES = {
  apiKey: '/melduo/cmrnw5td/AFRICASTALKING_API_KEY',
  username: '/melduo/cmrnw5td/AFRICASTALKING_USERNAME',
} as const;

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- ECR image asset (built from repo root Dockerfile) ---
    const imageAsset = new ecr_assets.DockerImageAsset(this, 'AppImage', {
      directory: path.join(__dirname, '..', '..'),  // repo root
    });

    // --- SSM SecureString parameters (values already stored by user) ---
    const apiKeyParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'ApiKeyParam',
      { parameterName: SSM_PARAM_NAMES.apiKey },
    );

    const usernameParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'UsernameParam',
      { parameterName: SSM_PARAM_NAMES.username },
    );

    // --- IAM role for App Runner to pull from ECR & read SSM secrets ---
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      inlinePolicies: {
        SsmReadSecrets: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ssm:GetParameters', 'ssm:GetParameter'],
              resources: [
                apiKeyParam.parameterArn,
                usernameParam.parameterArn,
              ],
            }),
            // App Runner secret injection also needs kms:Decrypt for SecureStrings
            // using the AWS-managed key (no explicit KMS key ARN needed for default key)
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['kms:Decrypt'],
              resources: [`arn:aws:kms:${this.region}:${this.account}:key/*`],
              conditions: {
                StringEquals: {
                  'kms:ViaService': `ssm.${this.region}.amazonaws.com`,
                },
              },
            }),
          ],
        }),
      },
    });

    // --- App Runner service ---
    const service = new Service(this, 'AppRunnerService', {
      serviceName: 'melduo-app-cmrnw5td',
      source: Source.fromAsset({
        imageConfiguration: {
          port: 5000,
          environmentSecrets: {
            AFRICASTALKING_API_KEY: Secret.fromSsmParameter(apiKeyParam),
            AFRICASTALKING_USERNAME: Secret.fromSsmParameter(usernameParam),
          },
        },
        asset: imageAsset,
      }),
      instanceRole,
    });

    // --- Stack output ---
    new cdk.CfnOutput(this, 'AppUrl', {
      key: 'AppUrl',
      value: `https://${service.serviceUrl}`,
      description: 'App Runner service URL',
    });
  }
}
