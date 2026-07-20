import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';

// ── SSM parameter names (declared once for auditability) ──────────────────────
const SSM_PARAMS = {
  AFRICASTALKING_API_KEY: '/melduo/cmrohlgz/AFRICASTALKING_API_KEY',
  AFRICASTALKING_USERNAME: '/melduo/cmrohlgz/AFRICASTALKING_USERNAME',
} as const;

export class MelduoAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── ECR repository ────────────────────────────────────────────────────────
    const repo = new ecr.Repository(this, 'AppRepo', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: 'Keep last 5 images',
        },
      ],
    });

    // ── App Runner instance role (grants access to SSM SecureString params) ──
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      inlinePolicies: {
        SsmSecrets: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ssm:GetParameters'],
              resources: Object.values(SSM_PARAMS).map(
                (name) =>
                  `arn:aws:ssm:${this.region}:${this.account}:parameter${name}`,
              ),
            }),
          ],
        }),
      },
    });

    // ── App Runner access role (allows App Runner to pull from ECR) ───────────
    const accessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess',
        ),
      ],
    });

    // ── App Runner service (L1 CfnService for SSM secret injection support) ──
    const service = new apprunner.CfnService(this, 'AppRunnerService', {
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        autoDeploymentsEnabled: false,
        imageRepository: {
          imageIdentifier: `${repo.repositoryUri}:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '5000',
            runtimeEnvironmentSecrets: [
              {
                name: 'AFRICASTALKING_API_KEY',
                value: `arn:aws:ssm:${this.region}:${this.account}:parameter${SSM_PARAMS.AFRICASTALKING_API_KEY}`,
              },
              {
                name: 'AFRICASTALKING_USERNAME',
                value: `arn:aws:ssm:${this.region}:${this.account}:parameter${SSM_PARAMS.AFRICASTALKING_USERNAME}`,
              },
            ],
          },
        },
      },
      instanceConfiguration: {
        instanceRoleArn: instanceRole.roleArn,
        cpu: '0.25 vCPU',
        memory: '0.5 GB',
      },
    });

    service.addDependency(accessRole.node.defaultChild as cdk.CfnResource);
    service.addDependency(instanceRole.node.defaultChild as cdk.CfnResource);

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${service.attrServiceUrl}`,
      description: 'App Runner service URL',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: repo.repositoryUri,
      description: 'ECR repository URI for image pushes',
    });
  }
}
