"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediQueueInfraStack = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
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
exports.MediQueueInfraStack = MediQueueInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVkaXF1ZXVlLWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWVkaXF1ZXVlLWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyxtREFBbUQ7QUFFbkQsTUFBYSxtQkFBb0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHFEQUFxRDtRQUNyRCxNQUFNLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQ3BFLFlBQVksRUFBRSwyQkFBMkI7WUFDekMsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLDBEQUEwRDtZQUNwRixtQkFBbUIsRUFBRSxLQUFLO1lBQzFCLGFBQWEsRUFBRTtnQkFDYixLQUFLLEVBQUUsSUFBSTtnQkFDWCxRQUFRLEVBQUUsS0FBSzthQUNoQjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLFNBQVMsRUFBRSxDQUFDO2dCQUNaLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGFBQWEsRUFBRSxJQUFJO2dCQUNuQixjQUFjLEVBQUUsSUFBSTtnQkFDcEIsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2FBQzNDO1lBQ0QsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlLENBQUMsVUFBVTtTQUNwRCxDQUFDLENBQUM7UUFFSCx5Q0FBeUM7UUFDekMsTUFBTSxjQUFjLEdBQUcsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSw4QkFBOEIsRUFBRTtZQUN0RixRQUFRO1lBQ1Isa0JBQWtCLEVBQUUsd0JBQXdCO1lBQzVDLGNBQWMsRUFBRSxLQUFLLEVBQUUsaURBQWlEO1lBQ3hFLFNBQVMsRUFBRTtnQkFDVCxZQUFZLEVBQUUsSUFBSSxFQUFFLHVEQUF1RDthQUM1RTtTQUNGLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7WUFDMUIsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUscUJBQXFCO1NBQ2xDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxnQkFBZ0I7WUFDdEMsV0FBVyxFQUFFLGlDQUFpQztZQUM5QyxVQUFVLEVBQUUsMkJBQTJCO1NBQ3hDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWxERCxrREFrREMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcblxuZXhwb3J0IGNsYXNzIE1lZGlRdWV1ZUluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyAxLiBDcmVhdGUgdGhlIENvZ25pdG8gVXNlciBQb29sIGZvciBob3NwaXRhbCBzdGFmZlxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ01lZGlRdWV1ZVN0YWZmVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6ICdtZWRpcXVldWUtc3RhZmYtdXNlci1wb29sJyxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiBmYWxzZSwgLy8gU2VjdXJpdHkgY29tcGxpYW5jZTogQWRtaW5zIG11c3QgcmVnaXN0ZXIgc3RhZmYgbWVtYmVyc1xuICAgICAgc2lnbkluQ2FzZVNlbnNpdGl2ZTogZmFsc2UsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICB1c2VybmFtZTogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiB0cnVlLFxuICAgICAgICB0ZW1wUGFzc3dvcmRWYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgIH0pO1xuXG4gICAgLy8gMi4gQ3JlYXRlIHRoZSBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnRcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdNZWRpUXVldWVTdGFmZlVzZXJQb29sQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2wsXG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6ICdtZWRpcXVldWUtc3RhZmYtY2xpZW50JyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSwgLy8gTXVzdCBiZSBmYWxzZSBmb3IgZnJvbnRlbmQgY2xpZW50IGFwcGxpY2F0aW9uc1xuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSwgLy8gUmVxdWlyZWQgZm9yIEluaXRpYXRlQXV0aCAvIFBPU1QgL2F1dGgvbG9naW4gY29tbWFuZFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHMgZm9yIGhhbmRvZmYvZnJvbnRlbmQgY29uZmlndXJhdGlvblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnTWVkaVF1ZXVlVXNlclBvb2xJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdNZWRpUXVldWVVc2VyUG9vbENsaWVudElkJyxcbiAgICB9KTtcbiAgfVxufVxuIl19