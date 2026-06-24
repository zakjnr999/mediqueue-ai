import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class MediQueueInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Create the Cognito User Pool for hospital staff
    const userPool = new cognito.UserPool(this, 'MediQueueStaffUserPool', {
      userPoolName: 'mediqueue-staff-user-pool',
      selfSignUpEnabled: false, // Security compliance: Admins must register staff members
      signInCaseSensitive: false,
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    // 2. Create the Cognito User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'MediQueueStaffUserPoolClient', {
      userPool,
      userPoolClientName: 'mediqueue-staff-client',
      generateSecret: false, // Must be false for frontend client applications
      authFlows: {
        userPassword: true, // Required for InitiateAuth / POST /auth/login command
      },
    });

    // Outputs for handoff/frontend configuration
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'The Cognito User Pool ID',
      exportName: 'MediQueueUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'The Cognito User Pool Client ID',
      exportName: 'MediQueueUserPoolClientId',
    });
  }
}
