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
            BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVkaXF1ZXVlLWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWVkaXF1ZXVlLWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxtREFBbUQ7QUFDbkQscURBQXFEO0FBQ3JELGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQsMkNBQTJDO0FBQzNDLDZCQUE2QjtBQUU3QixNQUFhLG1CQUFvQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIscURBQXFEO1FBQ3JELE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDcEUsWUFBWSxFQUFFLDJCQUEyQjtZQUN6QyxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsMERBQTBEO1lBQ3BGLG1CQUFtQixFQUFFLEtBQUs7WUFDMUIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2dCQUNYLFFBQVEsRUFBRSxLQUFLO2FBQ2hCO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxjQUFjLEVBQUU7Z0JBQ2QsU0FBUyxFQUFFLENBQUM7Z0JBQ1osZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsYUFBYSxFQUFFLElBQUk7Z0JBQ25CLGNBQWMsRUFBRSxJQUFJO2dCQUNwQixvQkFBb0IsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDM0M7WUFDRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxVQUFVO1NBQ3BELENBQUMsQ0FBQztRQUVILHlDQUF5QztRQUN6QyxNQUFNLGNBQWMsR0FBRyxJQUFJLE9B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LEVBQUU7WUFDaEMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLCtCQUErQjtZQUM1QyxVQUFVLEVBQUUsaUJBQWlCO1NBQzlCLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhPRCxrREF3T0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBNZWRpUXVldWVJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gMS4gQ3JlYXRlIHRoZSBDb2duaXRvIFVzZXIgUG9vbCBmb3IgaG9zcGl0YWwgc3RhZmZcbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdNZWRpUXVldWVTdGFmZlVzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiAnbWVkaXF1ZXVlLXN0YWZmLXVzZXItcG9vbCcsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogZmFsc2UsIC8vIFNlY3VyaXR5IGNvbXBsaWFuY2U6IEFkbWlucyBtdXN0IHJlZ2lzdGVyIHN0YWZmIG1lbWJlcnNcbiAgICAgIHNpZ25JbkNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICB9KTtcblxuICAgIC8vIDIuIENyZWF0ZSB0aGUgQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50XG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnTWVkaVF1ZXVlU3RhZmZVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAnbWVkaXF1ZXVlLXN0YWZmLWNsaWVudCcsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsIC8vIE11c3QgYmUgZmFsc2UgZm9yIGZyb250ZW5kIGNsaWVudCBhcHBsaWNhdGlvbnNcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsIC8vIFJlcXVpcmVkIGZvciBJbml0aWF0ZUF1dGggLyBQT1NUIC9hdXRoL2xvZ2luIGNvbW1hbmRcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyAzLiBDcmVhdGUgdGhlIHNpbmdsZSBEeW5hbW9EQiB0YWJsZVxuICAgIGNvbnN0IHRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdNZWRpUXVldWVQYXRpZW50c1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiAnTWVkaVF1ZXVlUGF0aWVudHNUYWJsZScsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBSZWNvbW1lbmRlZCBvbmx5IGZvciBoYWNrYXRob25zL2RldlxuICAgIH0pO1xuXG4gICAgLy8gNC4gQWRkIHRoZSBHbG9iYWwgU2Vjb25kYXJ5IEluZGV4IChnc2kxKSB0byB0aGUgdGFibGVcbiAgICB0YWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdnc2kxJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZ3NpMXBrJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2dzaTFzaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuSU5DTFVERSxcbiAgICAgIG5vbktleUF0dHJpYnV0ZXM6IFtcbiAgICAgICAgJ2VudGl0eVR5cGUnLFxuICAgICAgICAncGF0aWVudElkJyxcbiAgICAgICAgJ3F1ZXVlTnVtYmVyJyxcbiAgICAgICAgJ2Z1bGxOYW1lJyxcbiAgICAgICAgJ2FnZScsXG4gICAgICAgICdzdGF0dXMnLFxuICAgICAgICAnYWlBc3Nlc3NtZW50JyxcbiAgICAgICAgJ3N0YWZmRGVjaXNpb24nLFxuICAgICAgICAnY3JlYXRlZEF0JyxcbiAgICAgICAgJ2lzRXNjYWxhdGVkJyxcbiAgICAgICAgJ2VzY2FsYXRlZEJ5JyxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBBc3NldCBjb2RlIHBhdGggZm9yIFRyaWFnZSBiYWNrZW5kIExhbWJkYSBoYW5kbGVyc1xuICAgIGNvbnN0IHRyaWFnZUNvZGUgPSBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL3NlcnZpY2VzL3RyaWFnZScpKTtcblxuICAgIC8vIENvbW1vbiBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9ucyBmb3IgZnVuY3Rpb25zXG4gICAgY29uc3QgY29tbW9uRW52ID0ge1xuICAgICAgUEFUSUVOVFNfVEFCTEVfTkFNRTogdGFibGUudGFibGVOYW1lLFxuICAgICAgUEFUSUVOVFNfUVVFVUVfSU5ERVhfTkFNRTogJ2dzaTEnLFxuICAgICAgQkVEUk9DS19NT0RFTF9JRDogJ2FudGhyb3BpYy5jbGF1ZGUtMy1oYWlrdS0yMDI0MDMwNy12MTowJyxcbiAgICAgIEFWRVJBR0VfV0FJVF9USU1FX01VTFRJUExJRVI6ICc1JyxcbiAgICB9O1xuXG4gICAgLy8gSGVscGVyIHRvIGNyZWF0ZSBMYW1iZGEgZnVuY3Rpb25zXG4gICAgY29uc3QgY3JlYXRlVHJpYWdlTGFtYmRhID0gKGZuSWQ6IHN0cmluZywgaGFuZGxlckZpbGU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZm4gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIGZuSWQsIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6IGBzcmMvaGFuZGxlcnMvJHtoYW5kbGVyRmlsZX0uaGFuZGxlcmAsXG4gICAgICAgIGNvZGU6IHRyaWFnZUNvZGUsXG4gICAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSwgLy8gYWNjb21tb2RhdGluZyBCZWRyb2NrIGxhdGVuY3lcbiAgICAgIH0pO1xuXG4gICAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyBvbiB0aGUgYmFzZSB0YWJsZSBhbmQgdGhlIGluZGV4XG4gICAgICB0YWJsZS5ncmFudFJlYWRXcml0ZURhdGEoZm4pO1xuICAgICAgZm4uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFt0YWJsZS50YWJsZUFybiwgYCR7dGFibGUudGFibGVBcm59L2luZGV4LypgXSxcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICByZXR1cm4gZm47XG4gICAgfTtcblxuICAgIC8vIDUuIEluc3RhbnRpYXRlIExhbWJkYSBmdW5jdGlvbnMgZm9yIHRoZSA4IHJvdXRlc1xuICAgIGNvbnN0IGNyZWF0ZUNoZWNraW5GbiA9IGNyZWF0ZVRyaWFnZUxhbWJkYSgnQ3JlYXRlQ2hlY2tpbkZuJywgJ2NyZWF0ZS1jaGVja2luJyk7XG4gICAgY29uc3QgZ2V0UXVldWVGbiA9IGNyZWF0ZVRyaWFnZUxhbWJkYSgnR2V0UXVldWVGbicsICdnZXQtcXVldWUnKTtcbiAgICBjb25zdCBnZXRQYXRpZW50Rm4gPSBjcmVhdGVUcmlhZ2VMYW1iZGEoJ0dldFBhdGllbnRGbicsICdnZXQtcGF0aWVudCcpO1xuICAgIGNvbnN0IGdldFN0YXRzRm4gPSBjcmVhdGVUcmlhZ2VMYW1iZGEoJ0dldFN0YXRzRm4nLCAnZ2V0LXN0YXRzJyk7XG4gICAgY29uc3QgZXNjYWxhdGVQYXRpZW50Rm4gPSBjcmVhdGVUcmlhZ2VMYW1iZGEoJ0VzY2FsYXRlUGF0aWVudEZuJywgJ2VzY2FsYXRlLXBhdGllbnQnKTtcbiAgICBjb25zdCB1cGRhdGVQcmlvcml0eUZuID0gY3JlYXRlVHJpYWdlTGFtYmRhKCdVcGRhdGVQcmlvcml0eUZuJywgJ3VwZGF0ZS1wcmlvcml0eScpO1xuICAgIGNvbnN0IHVwZGF0ZVN0YXR1c0ZuID0gY3JlYXRlVHJpYWdlTGFtYmRhKCdVcGRhdGVTdGF0dXNGbicsICd1cGRhdGUtc3RhdHVzJyk7XG5cbiAgICBjb25zdCBsb2dpbkZuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnTG9naW5GbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ3NyYy9oYW5kbGVycy9sb2dpbi5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IHRyaWFnZUNvZGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9DTElFTlRfSUQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgIH0pO1xuXG4gICAgLy8gNi4gR3JhbnQgc3BlY2lhbCBhZGRpdGlvbmFsIHBlcm1pc3Npb25zXG4gICAgLy8gR3JhbnQgQ2hlY2staW4gTGFtYmRhIEJlZHJvY2sgTW9kZWwgSW52b2NhdGlvblxuICAgIGNyZWF0ZUNoZWNraW5Gbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydiZWRyb2NrOkludm9rZU1vZGVsJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBHcmFudCBMb2dpbiBMYW1iZGEgQ29nbml0byBJRFAgYXV0aGVudGljYXRpb25cbiAgICBsb2dpbkZuLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2NvZ25pdG8taWRwOkluaXRpYXRlQXV0aCddLFxuICAgICAgICByZXNvdXJjZXM6IFt1c2VyUG9vbC51c2VyUG9vbEFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA3LiBDb25maWd1cmUgQVBJIEdhdGV3YXlcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdNZWRpUXVldWVBUEknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ21lZGlxdWV1ZS1hcGknLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdYLUFtei1EYXRlJywgJ0F1dGhvcml6YXRpb24nLCAnWC1BcGktS2V5JywgJ1gtQW16LVNlY3VyaXR5LVRva2VuJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byB1c2VyIHBvb2xzIGF1dGhvcml6ZXIgZm9yIHNlY3VyZWQgcm91dGVzXG4gICAgY29uc3QgYXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdNZWRpUXVldWVDb2duaXRvQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFt1c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogJ21lZGlxdWV1ZS1hdXRob3JpemVyJyxcbiAgICB9KTtcblxuICAgIC8vIEhlbHBlciB0byBtYXAgaW50ZWdyYXRpb25zIHdpdGgvd2l0aG91dCBhdXRoXG4gICAgY29uc3QgYWRkUm91dGUgPSAoXG4gICAgICByZXNvdXJjZTogYXBpZ2F0ZXdheS5JUmVzb3VyY2UsXG4gICAgICBtZXRob2Q6IHN0cmluZyxcbiAgICAgIGZuOiBsYW1iZGEuRnVuY3Rpb24sXG4gICAgICByZXF1aXJlQXV0aCA9IGZhbHNlXG4gICAgKSA9PiB7XG4gICAgICBjb25zdCBpbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZuKTtcbiAgICAgIGlmIChyZXF1aXJlQXV0aCkge1xuICAgICAgICByZXNvdXJjZS5hZGRNZXRob2QobWV0aG9kLCBpbnRlZ3JhdGlvbiwge1xuICAgICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvdXJjZS5hZGRNZXRob2QobWV0aG9kLCBpbnRlZ3JhdGlvbik7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIE1hcHBpbmcgUkVTVCBwYXRoc1xuICAgIC8vIFBPU1QgL2F1dGgvbG9naW4gKFB1YmxpYylcbiAgICBjb25zdCBhdXRoUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xuICAgIGNvbnN0IGxvZ2luUmVzb3VyY2UgPSBhdXRoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2xvZ2luJyk7XG4gICAgYWRkUm91dGUobG9naW5SZXNvdXJjZSwgJ1BPU1QnLCBsb2dpbkZuKTtcblxuICAgIC8vIFBPU1QgL2NoZWNrLWlucyAoUHVibGljKVxuICAgIGNvbnN0IGNoZWNraW5zUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnY2hlY2staW5zJyk7XG4gICAgYWRkUm91dGUoY2hlY2tpbnNSZXNvdXJjZSwgJ1BPU1QnLCBjcmVhdGVDaGVja2luRm4pO1xuXG4gICAgLy8gR0VUIC9xdWV1ZSAoQXV0aG9yaXplZClcbiAgICBjb25zdCBxdWV1ZVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3F1ZXVlJyk7XG4gICAgYWRkUm91dGUocXVldWVSZXNvdXJjZSwgJ0dFVCcsIGdldFF1ZXVlRm4sIHRydWUpO1xuXG4gICAgLy8gR0VUIC9xdWV1ZS9zdGF0cyAoQXV0aG9yaXplZClcbiAgICBjb25zdCBzdGF0c1Jlc291cmNlID0gcXVldWVSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3RhdHMnKTtcbiAgICBhZGRSb3V0ZShzdGF0c1Jlc291cmNlLCAnR0VUJywgZ2V0U3RhdHNGbiwgdHJ1ZSk7XG5cbiAgICAvLyAvcGF0aWVudHMgKEdyb3VwKVxuICAgIGNvbnN0IHBhdGllbnRzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgncGF0aWVudHMnKTtcblxuICAgIC8vIC9wYXRpZW50cy97cGF0aWVudElkfSAoR3JvdXApXG4gICAgY29uc3QgcGF0aWVudElkUmVzb3VyY2UgPSBwYXRpZW50c1Jlc291cmNlLmFkZFJlc291cmNlKCd7cGF0aWVudElkfScpO1xuICAgIGFkZFJvdXRlKHBhdGllbnRJZFJlc291cmNlLCAnR0VUJywgZ2V0UGF0aWVudEZuLCB0cnVlKTtcblxuICAgIC8vIFBPU1QgL3BhdGllbnRzL3twYXRpZW50SWR9L2VzY2FsYXRlIChBdXRob3JpemVkKVxuICAgIGNvbnN0IGVzY2FsYXRlUmVzb3VyY2UgPSBwYXRpZW50SWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnZXNjYWxhdGUnKTtcbiAgICBhZGRSb3V0ZShlc2NhbGF0ZVJlc291cmNlLCAnUE9TVCcsIGVzY2FsYXRlUGF0aWVudEZuLCB0cnVlKTtcblxuICAgIC8vIFBBVENIIC9wYXRpZW50cy97cGF0aWVudElkfS9wcmlvcml0eSAoQXV0aG9yaXplZClcbiAgICBjb25zdCBwcmlvcml0eVJlc291cmNlID0gcGF0aWVudElkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3ByaW9yaXR5Jyk7XG4gICAgYWRkUm91dGUocHJpb3JpdHlSZXNvdXJjZSwgJ1BBVENIJywgdXBkYXRlUHJpb3JpdHlGbiwgdHJ1ZSk7XG5cbiAgICAvLyBQQVRDSCAvcGF0aWVudHMve3BhdGllbnRJZH0vc3RhdHVzIChBdXRob3JpemVkKVxuICAgIGNvbnN0IHN0YXR1c1Jlc291cmNlID0gcGF0aWVudElkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0YXR1cycpO1xuICAgIGFkZFJvdXRlKHN0YXR1c1Jlc291cmNlLCAnUEFUQ0gnLCB1cGRhdGVTdGF0dXNGbiwgdHJ1ZSk7XG5cbiAgICAvLyBPdXRwdXRzIGZvciBoYW5kb2ZmL2Zyb250ZW5kIGNvbmZpZ3VyYXRpb25cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogJ01lZGlRdWV1ZVVzZXJQb29sSWQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIENvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnTWVkaVF1ZXVlVXNlclBvb2xDbGllbnRJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGJhc2UgVVJMIGVuZHBvaW50JyxcbiAgICAgIGV4cG9ydE5hbWU6ICdNZWRpUXVldWVBcGlVcmwnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=