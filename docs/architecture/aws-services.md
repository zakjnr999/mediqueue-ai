# MediQueue AI - AWS Services Architecture

MediQueue AI is built on a fully serverless, highly available AWS architecture. This document maps out the specific AWS services utilized and their roles in the MVP application.

---

## 1. AWS Service Map

```text
                     +-----------------------+
                     |  Patient Web Portal   | (Hosted via Amplify)
                     +-----------------------+
                                 |
                                 v
                     +-----------------------+
                     |  Amazon API Gateway   |
                     +-----------------------+
                                 |
                                 v
+-------------------+ +-----------------------+
|   Amazon Cognito  | |      AWS Lambda       |
+-------------------+ +-----------------------+
    (Auth tokens)                |
                                 +----------+----------+
                                 |                     |
                                 v                     v
                     +-----------------------+ +---------------+
                     |    Amazon Bedrock     | |Amazon DynamoDB|
                     +-----------------------+ +---------------+
```

---

## 2. Service Roles & Configurations

### 2.1 Amazon Bedrock
* **Model ID**: `amazon.nova-2-lite-v1:0` (or region-appropriate lightweight model).
* **Role**: Evaluates age and symptom tags, performs pattern-matching check for clinical red flags, generates a concise case summary, and suggests a recommended triage priority level.
* **Region**: `us-west-2` (configured in env setup).

### 2.2 AWS Lambda
* **Handlers**: Runs Node.js ES modules.
* **Role**: Orchestrates requests. Strips PHI before invoking Bedrock, reads and updates patient records in DynamoDB, generates sequence numbers, and executes state validations.
* **Timeout**: Configured to 15 seconds to accommodate Bedrock API model invocation latency.

### 2.3 Amazon API Gateway
* **Protocol**: REST API.
* **Role**: Routes public patient endpoints (`POST /check-ins`, `GET /patients/{id}`) and authenticated staff endpoints. Integrates CORS and AWS Lambda triggers.

### 2.4 Amazon DynamoDB
* **Capacity**: On-Demand (pay-per-request) provisioning.
* **Role**: Stores patient details, check-in history, dynamic queue sequences, and staff audit trails. Utilizes Global Secondary Indexes (GSIs) for fast list queries.

### 2.5 Amazon Cognito
* **Role**: Provides secure clinical user sign-ins, JWT session signing, and password resets.

### 2.6 AWS Amplify
* **Role**: Continuous deployment and hosting for the Next.js single-page responsive web application.

### 2.7 Amazon CloudWatch
* **Role**: Structured logs repository. Captures API Gateway request logs, Lambda function errors, and model run metrics for compliance auditing.
