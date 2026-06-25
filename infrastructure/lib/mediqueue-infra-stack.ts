import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

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

    // 3. Create the single DynamoDB table
    const table = new dynamodb.Table(this, 'MediQueuePatientsTable', {
      tableName: 'MediQueuePatientsTable',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Recommended only for hackathons/dev
    });

    // 4. Add the Global Secondary Index (gsi1) to the table
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'entityType',
        'patientId',
        'queueNumber',
        'fullName',
        'age',
        'sex',
        'status',
        'aiAssessment',
        'staffDecision',
        'createdAt',
        'isEscalated',
        'escalatedBy',
      ],
    });

    // Asset code path for Triage backend Lambda handlers
    const triageCode = lambda.Code.fromAsset(path.join(__dirname, '../../services/triage'));

    // Common environment configurations for functions
    const commonEnv = {
      PATIENTS_TABLE_NAME: table.tableName,
      PATIENTS_QUEUE_INDEX_NAME: 'gsi1',
      BEDROCK_MODEL_ID: 'amazon.nova-2-lite-v1:0',
      AVERAGE_WAIT_TIME_MULTIPLIER: '5',
    };

    // Helper to create Lambda functions
    const createTriageLambda = (fnId: string, handlerFile: string) => {
      const fn = new lambda.Function(this, fnId, {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: `src/handlers/${handlerFile}.handler`,
        code: triageCode,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(30), // accommodating Bedrock latency
      });

      // Grant permissions on the base table and the index
      table.grantReadWriteData(fn);
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:Query',
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
          ],
          resources: [table.tableArn, `${table.tableArn}/index/*`],
        })
      );
      return fn;
    };

    // 5. Instantiate Lambda functions for the 8 routes
    const createCheckinFn = createTriageLambda('CreateCheckinFn', 'create-checkin');
    const getQueueFn = createTriageLambda('GetQueueFn', 'get-queue');
    const getPatientFn = createTriageLambda('GetPatientFn', 'get-patient');
    const getStatsFn = createTriageLambda('GetStatsFn', 'get-stats');
    const escalatePatientFn = createTriageLambda('EscalatePatientFn', 'escalate-patient');
    const updatePriorityFn = createTriageLambda('UpdatePriorityFn', 'update-priority');
    const updateStatusFn = createTriageLambda('UpdateStatusFn', 'update-status');

    const loginFn = new lambda.Function(this, 'LoginFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'src/handlers/login.handler',
      code: triageCode,
      environment: {
        COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
      timeout: cdk.Duration.seconds(15),
    });

    // 6. Grant special additional permissions
    // Grant Check-in Lambda Bedrock Model Invocation
    createCheckinFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    // Grant Login Lambda Cognito IDP authentication
    loginFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:InitiateAuth'],
        resources: [userPool.userPoolArn],
      })
    );

    // 7. Configure API Gateway
    const api = new apigateway.RestApi(this, 'MediQueueAPI', {
      restApiName: 'mediqueue-api',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
    });

    // Cognito user pools authorizer for secured routes
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'MediQueueCognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'mediqueue-authorizer',
    });

    // Helper to map integrations with/without auth
    const addRoute = (
      resource: apigateway.IResource,
      method: string,
      fn: lambda.Function,
      requireAuth = false
    ) => {
      const integration = new apigateway.LambdaIntegration(fn);
      if (requireAuth) {
        resource.addMethod(method, integration, {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        });
      } else {
        resource.addMethod(method, integration);
      }
    };

    // Mapping REST paths
    // POST /auth/login (Public)
    const authResource = api.root.addResource('auth');
    const loginResource = authResource.addResource('login');
    addRoute(loginResource, 'POST', loginFn);

    // POST /check-ins (Public)
    const checkinsResource = api.root.addResource('check-ins');
    addRoute(checkinsResource, 'POST', createCheckinFn);

    // GET /queue (Authorized)
    const queueResource = api.root.addResource('queue');
    addRoute(queueResource, 'GET', getQueueFn, true);

    // GET /queue/stats (Authorized)
    const statsResource = queueResource.addResource('stats');
    addRoute(statsResource, 'GET', getStatsFn, true);

    // /patients (Group)
    const patientsResource = api.root.addResource('patients');

    // /patients/{patientId} (Group)
    const patientIdResource = patientsResource.addResource('{patientId}');
    addRoute(patientIdResource, 'GET', getPatientFn, true);

    // POST /patients/{patientId}/escalate (Authorized)
    const escalateResource = patientIdResource.addResource('escalate');
    addRoute(escalateResource, 'POST', escalatePatientFn, true);

    // PATCH /patients/{patientId}/priority (Authorized)
    const priorityResource = patientIdResource.addResource('priority');
    addRoute(priorityResource, 'PATCH', updatePriorityFn, true);

    // PATCH /patients/{patientId}/status (Authorized)
    const statusResource = patientIdResource.addResource('status');
    addRoute(statusResource, 'PATCH', updateStatusFn, true);

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

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway base URL endpoint',
      exportName: 'MediQueueApiUrl',
    });
  }
}
