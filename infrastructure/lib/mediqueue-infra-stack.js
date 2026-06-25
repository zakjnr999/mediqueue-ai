"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediQueueInfraStack = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const iam = require("aws-cdk-lib/aws-iam");
const path = require("path");
class MediQueueInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        const createTriageLambda = (fnId, handlerFile) => {
            const fn = new lambda.Function(this, fnId, {
                runtime: lambda.Runtime.NODEJS_20_X,
                handler: `src/handlers/${handlerFile}.handler`,
                code: triageCode,
                environment: commonEnv,
                timeout: cdk.Duration.seconds(30), // accommodating Bedrock latency
            });
            // Grant permissions on the base table and the index
            table.grantReadWriteData(fn);
            fn.addToRolePolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'dynamodb:Query',
                    'dynamodb:GetItem',
                    'dynamodb:PutItem',
                    'dynamodb:UpdateItem',
                ],
                resources: [table.tableArn, `${table.tableArn}/index/*`],
            }));
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
        createCheckinFn.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['bedrock:InvokeModel'],
            resources: ['*'],
        }));
        // Grant Login Lambda Cognito IDP authentication
        loginFn.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['cognito-idp:InitiateAuth'],
            resources: [userPool.userPoolArn],
        }));
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
        const addRoute = (resource, method, fn, requireAuth = false) => {
            const integration = new apigateway.LambdaIntegration(fn);
            if (requireAuth) {
                resource.addMethod(method, integration, {
                    authorizer,
                    authorizationType: apigateway.AuthorizationType.COGNITO,
                });
            }
            else {
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
exports.MediQueueInfraStack = MediQueueInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVkaXF1ZXVlLWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWVkaXF1ZXVlLWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxtREFBbUQ7QUFDbkQscURBQXFEO0FBQ3JELGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQsMkNBQTJDO0FBQzNDLDZCQUE2QjtBQUU3QixNQUFhLG1CQUFvQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIscURBQXFEO1FBQ3JELE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDcEUsWUFBWSxFQUFFLDJCQUEyQjtZQUN6QyxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsMERBQTBEO1lBQ3BGLG1CQUFtQixFQUFFLEtBQUs7WUFDMUIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2dCQUNYLFFBQVEsRUFBRSxLQUFLO2FBQ2hCO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxjQUFjLEVBQUU7Z0JBQ2QsU0FBUyxFQUFFLENBQUM7Z0JBQ1osZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsYUFBYSxFQUFFLElBQUk7Z0JBQ25CLGNBQWMsRUFBRSxJQUFJO2dCQUNwQixvQkFBb0IsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDM0M7WUFDRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxVQUFVO1NBQ3BELENBQUMsQ0FBQztRQUVILHlDQUF5QztRQUN6QyxNQUFNLGNBQWMsR0FBRyxJQUFJLE9B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LEVBQUU7WUFDaEMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLCtCQUErQjtZQUM1QyxVQUFVLEVBQUUsaUJBQWlCO1NBQzlCLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhPRCxrREF3T0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbmV4cG9ydCBjbGFzcyBNZWRpUXVldWVJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICAvLyAxLiBDcmVhdGUgdGhlIENvZ25pdG8gVXNlciBQb29sIGZvciBob3NwaXRhbCBzdGFmZlxyXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnTWVkaVF1ZXVlU3RhZmZVc2VyUG9vbCcsIHtcclxuICAgICAgdXNlclBvb2xOYW1lOiAnbWVkaXF1ZXVlLXN0YWZmLXVzZXItcG9vbCcsXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiBmYWxzZSwgLy8gU2VjdXJpdHkgY29tcGxpYW5jZTogQWRtaW5zIG11c3QgcmVnaXN0ZXIgc3RhZmYgbWVtYmVyc1xyXG4gICAgICBzaWduSW5DYXNlU2Vuc2l0aXZlOiBmYWxzZSxcclxuICAgICAgc2lnbkluQWxpYXNlczoge1xyXG4gICAgICAgIGVtYWlsOiB0cnVlLFxyXG4gICAgICAgIHVzZXJuYW1lOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgICAgYXV0b1ZlcmlmeToge1xyXG4gICAgICAgIGVtYWlsOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBwYXNzd29yZFBvbGljeToge1xyXG4gICAgICAgIG1pbkxlbmd0aDogOCxcclxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcclxuICAgICAgICB0ZW1wUGFzc3dvcmRWYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoNyksXHJcbiAgICAgIH0sXHJcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDIuIENyZWF0ZSB0aGUgQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50XHJcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdNZWRpUXVldWVTdGFmZlVzZXJQb29sQ2xpZW50Jywge1xyXG4gICAgICB1c2VyUG9vbCxcclxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAnbWVkaXF1ZXVlLXN0YWZmLWNsaWVudCcsXHJcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSwgLy8gTXVzdCBiZSBmYWxzZSBmb3IgZnJvbnRlbmQgY2xpZW50IGFwcGxpY2F0aW9uc1xyXG4gICAgICBhdXRoRmxvd3M6IHtcclxuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsIC8vIFJlcXVpcmVkIGZvciBJbml0aWF0ZUF1dGggLyBQT1NUIC9hdXRoL2xvZ2luIGNvbW1hbmRcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDMuIENyZWF0ZSB0aGUgc2luZ2xlIER5bmFtb0RCIHRhYmxlXHJcbiAgICBjb25zdCB0YWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnTWVkaVF1ZXVlUGF0aWVudHNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiAnTWVkaVF1ZXVlUGF0aWVudHNUYWJsZScsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBSZWNvbW1lbmRlZCBvbmx5IGZvciBoYWNrYXRob25zL2RldlxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNC4gQWRkIHRoZSBHbG9iYWwgU2Vjb25kYXJ5IEluZGV4IChnc2kxKSB0byB0aGUgdGFibGVcclxuICAgIHRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnZ3NpMScsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZ3NpMXBrJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAnZ3NpMXNrJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLklOQ0xVREUsXHJcbiAgICAgIG5vbktleUF0dHJpYnV0ZXM6IFtcclxuICAgICAgICAnZW50aXR5VHlwZScsXHJcbiAgICAgICAgJ3BhdGllbnRJZCcsXHJcbiAgICAgICAgJ3F1ZXVlTnVtYmVyJyxcclxuICAgICAgICAnZnVsbE5hbWUnLFxyXG4gICAgICAgICdhZ2UnLFxyXG4gICAgICAgICdzdGF0dXMnLFxyXG4gICAgICAgICdhaUFzc2Vzc21lbnQnLFxyXG4gICAgICAgICdzdGFmZkRlY2lzaW9uJyxcclxuICAgICAgICAnY3JlYXRlZEF0JyxcclxuICAgICAgICAnaXNFc2NhbGF0ZWQnLFxyXG4gICAgICAgICdlc2NhbGF0ZWRCeScsXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBc3NldCBjb2RlIHBhdGggZm9yIFRyaWFnZSBiYWNrZW5kIExhbWJkYSBoYW5kbGVyc1xyXG4gICAgY29uc3QgdHJpYWdlQ29kZSA9IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vc2VydmljZXMvdHJpYWdlJykpO1xyXG5cclxuICAgIC8vIENvbW1vbiBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9ucyBmb3IgZnVuY3Rpb25zXHJcbiAgICBjb25zdCBjb21tb25FbnYgPSB7XHJcbiAgICAgIFBBVElFTlRTX1RBQkxFX05BTUU6IHRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgUEFUSUVOVFNfUVVFVUVfSU5ERVhfTkFNRTogJ2dzaTEnLFxyXG4gICAgICBCRURST0NLX01PREVMX0lEOiAnYW1hem9uLm5vdmEtMi1saXRlLXYxOjAnLFxyXG4gICAgICBBVkVSQUdFX1dBSVRfVElNRV9NVUxUSVBMSUVSOiAnNScsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEhlbHBlciB0byBjcmVhdGUgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gICAgY29uc3QgY3JlYXRlVHJpYWdlTGFtYmRhID0gKGZuSWQ6IHN0cmluZywgaGFuZGxlckZpbGU6IHN0cmluZykgPT4ge1xyXG4gICAgICBjb25zdCBmbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgZm5JZCwge1xyXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICAgIGhhbmRsZXI6IGBzcmMvaGFuZGxlcnMvJHtoYW5kbGVyRmlsZX0uaGFuZGxlcmAsXHJcbiAgICAgICAgY29kZTogdHJpYWdlQ29kZSxcclxuICAgICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSwgLy8gYWNjb21tb2RhdGluZyBCZWRyb2NrIGxhdGVuY3lcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyBvbiB0aGUgYmFzZSB0YWJsZSBhbmQgdGhlIGluZGV4XHJcbiAgICAgIHRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShmbik7XHJcbiAgICAgIGZuLmFkZFRvUm9sZVBvbGljeShcclxuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXHJcbiAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcclxuICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxyXG4gICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgcmVzb3VyY2VzOiBbdGFibGUudGFibGVBcm4sIGAke3RhYmxlLnRhYmxlQXJufS9pbmRleC8qYF0sXHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgICAgcmV0dXJuIGZuO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyA1LiBJbnN0YW50aWF0ZSBMYW1iZGEgZnVuY3Rpb25zIGZvciB0aGUgOCByb3V0ZXNcclxuICAgIGNvbnN0IGNyZWF0ZUNoZWNraW5GbiA9IGNyZWF0ZVRyaWFnZUxhbWJkYSgnQ3JlYXRlQ2hlY2tpbkZuJywgJ2NyZWF0ZS1jaGVja2luJyk7XHJcbiAgICBjb25zdCBnZXRRdWV1ZUZuID0gY3JlYXRlVHJpYWdlTGFtYmRhKCdHZXRRdWV1ZUZuJywgJ2dldC1xdWV1ZScpO1xyXG4gICAgY29uc3QgZ2V0UGF0aWVudEZuID0gY3JlYXRlVHJpYWdlTGFtYmRhKCdHZXRQYXRpZW50Rm4nLCAnZ2V0LXBhdGllbnQnKTtcclxuICAgIGNvbnN0IGdldFN0YXRzRm4gPSBjcmVhdGVUcmlhZ2VMYW1iZGEoJ0dldFN0YXRzRm4nLCAnZ2V0LXN0YXRzJyk7XHJcbiAgICBjb25zdCBlc2NhbGF0ZVBhdGllbnRGbiA9IGNyZWF0ZVRyaWFnZUxhbWJkYSgnRXNjYWxhdGVQYXRpZW50Rm4nLCAnZXNjYWxhdGUtcGF0aWVudCcpO1xyXG4gICAgY29uc3QgdXBkYXRlUHJpb3JpdHlGbiA9IGNyZWF0ZVRyaWFnZUxhbWJkYSgnVXBkYXRlUHJpb3JpdHlGbicsICd1cGRhdGUtcHJpb3JpdHknKTtcclxuICAgIGNvbnN0IHVwZGF0ZVN0YXR1c0ZuID0gY3JlYXRlVHJpYWdlTGFtYmRhKCdVcGRhdGVTdGF0dXNGbicsICd1cGRhdGUtc3RhdHVzJyk7XHJcblxyXG4gICAgY29uc3QgbG9naW5GbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0xvZ2luRm4nLCB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICBoYW5kbGVyOiAnc3JjL2hhbmRsZXJzL2xvZ2luLmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiB0cmlhZ2VDb2RlLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIENPR05JVE9fVVNFUl9QT09MX0NMSUVOVF9JRDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcclxuICAgICAgfSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNi4gR3JhbnQgc3BlY2lhbCBhZGRpdGlvbmFsIHBlcm1pc3Npb25zXHJcbiAgICAvLyBHcmFudCBDaGVjay1pbiBMYW1iZGEgQmVkcm9jayBNb2RlbCBJbnZvY2F0aW9uXHJcbiAgICBjcmVhdGVDaGVja2luRm4uYWRkVG9Sb2xlUG9saWN5KFxyXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICAgIGFjdGlvbnM6IFsnYmVkcm9jazpJbnZva2VNb2RlbCddLFxyXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEdyYW50IExvZ2luIExhbWJkYSBDb2duaXRvIElEUCBhdXRoZW50aWNhdGlvblxyXG4gICAgbG9naW5Gbi5hZGRUb1JvbGVQb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogWydjb2duaXRvLWlkcDpJbml0aWF0ZUF1dGgnXSxcclxuICAgICAgICByZXNvdXJjZXM6IFt1c2VyUG9vbC51c2VyUG9vbEFybl0sXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIC8vIDcuIENvbmZpZ3VyZSBBUEkgR2F0ZXdheVxyXG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnTWVkaVF1ZXVlQVBJJywge1xyXG4gICAgICByZXN0QXBpTmFtZTogJ21lZGlxdWV1ZS1hcGknLFxyXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcclxuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcclxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcclxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ1gtQW16LURhdGUnLCAnQXV0aG9yaXphdGlvbicsICdYLUFwaS1LZXknLCAnWC1BbXotU2VjdXJpdHktVG9rZW4nXSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENvZ25pdG8gdXNlciBwb29scyBhdXRob3JpemVyIGZvciBzZWN1cmVkIHJvdXRlc1xyXG4gICAgY29uc3QgYXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdNZWRpUXVldWVDb2duaXRvQXV0aG9yaXplcicsIHtcclxuICAgICAgY29nbml0b1VzZXJQb29sczogW3VzZXJQb29sXSxcclxuICAgICAgYXV0aG9yaXplck5hbWU6ICdtZWRpcXVldWUtYXV0aG9yaXplcicsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBIZWxwZXIgdG8gbWFwIGludGVncmF0aW9ucyB3aXRoL3dpdGhvdXQgYXV0aFxyXG4gICAgY29uc3QgYWRkUm91dGUgPSAoXHJcbiAgICAgIHJlc291cmNlOiBhcGlnYXRld2F5LklSZXNvdXJjZSxcclxuICAgICAgbWV0aG9kOiBzdHJpbmcsXHJcbiAgICAgIGZuOiBsYW1iZGEuRnVuY3Rpb24sXHJcbiAgICAgIHJlcXVpcmVBdXRoID0gZmFsc2VcclxuICAgICkgPT4ge1xyXG4gICAgICBjb25zdCBpbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZuKTtcclxuICAgICAgaWYgKHJlcXVpcmVBdXRoKSB7XHJcbiAgICAgICAgcmVzb3VyY2UuYWRkTWV0aG9kKG1ldGhvZCwgaW50ZWdyYXRpb24sIHtcclxuICAgICAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJlc291cmNlLmFkZE1ldGhvZChtZXRob2QsIGludGVncmF0aW9uKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBNYXBwaW5nIFJFU1QgcGF0aHNcclxuICAgIC8vIFBPU1QgL2F1dGgvbG9naW4gKFB1YmxpYylcclxuICAgIGNvbnN0IGF1dGhSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhdXRoJyk7XHJcbiAgICBjb25zdCBsb2dpblJlc291cmNlID0gYXV0aFJlc291cmNlLmFkZFJlc291cmNlKCdsb2dpbicpO1xyXG4gICAgYWRkUm91dGUobG9naW5SZXNvdXJjZSwgJ1BPU1QnLCBsb2dpbkZuKTtcclxuXHJcbiAgICAvLyBQT1NUIC9jaGVjay1pbnMgKFB1YmxpYylcclxuICAgIGNvbnN0IGNoZWNraW5zUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnY2hlY2staW5zJyk7XHJcbiAgICBhZGRSb3V0ZShjaGVja2luc1Jlc291cmNlLCAnUE9TVCcsIGNyZWF0ZUNoZWNraW5Gbik7XHJcblxyXG4gICAgLy8gR0VUIC9xdWV1ZSAoQXV0aG9yaXplZClcclxuICAgIGNvbnN0IHF1ZXVlUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgncXVldWUnKTtcclxuICAgIGFkZFJvdXRlKHF1ZXVlUmVzb3VyY2UsICdHRVQnLCBnZXRRdWV1ZUZuLCB0cnVlKTtcclxuXHJcbiAgICAvLyBHRVQgL3F1ZXVlL3N0YXRzIChBdXRob3JpemVkKVxyXG4gICAgY29uc3Qgc3RhdHNSZXNvdXJjZSA9IHF1ZXVlUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0YXRzJyk7XHJcbiAgICBhZGRSb3V0ZShzdGF0c1Jlc291cmNlLCAnR0VUJywgZ2V0U3RhdHNGbiwgdHJ1ZSk7XHJcblxyXG4gICAgLy8gL3BhdGllbnRzIChHcm91cClcclxuICAgIGNvbnN0IHBhdGllbnRzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgncGF0aWVudHMnKTtcclxuXHJcbiAgICAvLyAvcGF0aWVudHMve3BhdGllbnRJZH0gKEdyb3VwKVxyXG4gICAgY29uc3QgcGF0aWVudElkUmVzb3VyY2UgPSBwYXRpZW50c1Jlc291cmNlLmFkZFJlc291cmNlKCd7cGF0aWVudElkfScpO1xyXG4gICAgYWRkUm91dGUocGF0aWVudElkUmVzb3VyY2UsICdHRVQnLCBnZXRQYXRpZW50Rm4sIHRydWUpO1xyXG5cclxuICAgIC8vIFBPU1QgL3BhdGllbnRzL3twYXRpZW50SWR9L2VzY2FsYXRlIChBdXRob3JpemVkKVxyXG4gICAgY29uc3QgZXNjYWxhdGVSZXNvdXJjZSA9IHBhdGllbnRJZFJlc291cmNlLmFkZFJlc291cmNlKCdlc2NhbGF0ZScpO1xyXG4gICAgYWRkUm91dGUoZXNjYWxhdGVSZXNvdXJjZSwgJ1BPU1QnLCBlc2NhbGF0ZVBhdGllbnRGbiwgdHJ1ZSk7XHJcblxyXG4gICAgLy8gUEFUQ0ggL3BhdGllbnRzL3twYXRpZW50SWR9L3ByaW9yaXR5IChBdXRob3JpemVkKVxyXG4gICAgY29uc3QgcHJpb3JpdHlSZXNvdXJjZSA9IHBhdGllbnRJZFJlc291cmNlLmFkZFJlc291cmNlKCdwcmlvcml0eScpO1xyXG4gICAgYWRkUm91dGUocHJpb3JpdHlSZXNvdXJjZSwgJ1BBVENIJywgdXBkYXRlUHJpb3JpdHlGbiwgdHJ1ZSk7XHJcblxyXG4gICAgLy8gUEFUQ0ggL3BhdGllbnRzL3twYXRpZW50SWR9L3N0YXR1cyAoQXV0aG9yaXplZClcclxuICAgIGNvbnN0IHN0YXR1c1Jlc291cmNlID0gcGF0aWVudElkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0YXR1cycpO1xyXG4gICAgYWRkUm91dGUoc3RhdHVzUmVzb3VyY2UsICdQQVRDSCcsIHVwZGF0ZVN0YXR1c0ZuLCB0cnVlKTtcclxuXHJcbiAgICAvLyBPdXRwdXRzIGZvciBoYW5kb2ZmL2Zyb250ZW5kIGNvbmZpZ3VyYXRpb25cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xyXG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgQ29nbml0byBVc2VyIFBvb2wgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiAnTWVkaVF1ZXVlVXNlclBvb2xJZCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcclxuICAgICAgdmFsdWU6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIENvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdNZWRpUXVldWVVc2VyUG9vbENsaWVudElkJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XHJcbiAgICAgIHZhbHVlOiBhcGkudXJsLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGJhc2UgVVJMIGVuZHBvaW50JyxcclxuICAgICAgZXhwb3J0TmFtZTogJ01lZGlRdWV1ZUFwaVVybCcsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19