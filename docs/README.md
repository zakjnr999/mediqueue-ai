# MediQueue AI Architecture

This folder contains the technical architecture and system-design documentation for MediQueue AI.

## Core System Flow

```text
Patient Web Interface
→ Amazon API Gateway
→ AWS Lambda
→ Amazon Bedrock
→ Amazon DynamoDB
→ Staff Web Dashboard
```

## Main Components

### Patient Web Interface

Allows patients to:

* Enter basic information
* Select symptoms
* Add extra symptom details
* Submit a digital check-in
* Receive a queue number
* View their queue status

### Staff Web Dashboard

Allows hospital staff to:

* View the live patient queue
* Review Bedrock-generated summaries
* See suggested priority levels
* Confirm or override AI suggestions
* Update patient status
* Monitor basic queue activity

### Amazon API Gateway

Acts as the secure entry point for requests from the web application.

It connects the patient and staff interfaces to the backend Lambda functions.

### AWS Lambda

Handles backend operations such as:

* Creating patient check-ins
* Calling Amazon Bedrock
* Generating queue numbers
* Saving queue records
* Retrieving the patient queue
* Updating priority and patient status

### Amazon Bedrock

Provides the Generative AI support for:

* Summarizing patient-reported symptoms
* Identifying possible red flags
* Suggesting a preliminary priority level
* Explaining why staff review may be required

Amazon Bedrock does not diagnose patients or make the final clinical decision.

Healthcare staff must confirm or override every AI suggestion.

### Amazon DynamoDB

Stores:

* Patient check-in records
* Selected symptoms
* Additional symptom details
* Bedrock summary
* Suggested priority
* Staff-confirmed priority
* Queue number
* Patient status
* Timestamps

### Amazon Cognito

May be used to authenticate hospital staff before they access the protected dashboard.

### AWS Amplify

May be used to host and deploy the responsive web application.

### Amazon CloudWatch

Stores logs and helps the team monitor:

* Lambda errors
* API failures
* Bedrock invocation issues
* Application performance

## Queue Logic

* Normal and minor cases follow first come, first serve.
* Urgent cases are highlighted for staff review.
* Bedrock only suggests priority.
* Staff make the final decision.
* Staff can override the suggested priority.
* Waiting time should also be considered to prevent queue starvation.
* True emergency cases should be escalated immediately.

## Architecture Documents to Store Here

This folder may contain:

* `architecture-diagram.png`
* `data-flow-diagram.png`
* `database-design.md`
* `aws-services.md`
* `security-notes.md`
* `queue-logic.md`

## Architecture Rules

* Use AWS Region `us-west-2`.
* Keep the MVP architecture simple and serverless.
* Do not use external AI APIs.
* The AI feature must use Amazon Bedrock.
* Do not store real patient data during development.
* Do not commit AWS credentials or workshop passwords.
* Use only services that directly support the MVP.
* Document every important architecture decision.
