# MediQueue Triage Service

This folder contains the backend and Amazon Bedrock triage-support logic.

The service will be responsible for:

- Receiving patient check-in information
- Validating submitted symptoms
- Sending symptom information to Amazon Bedrock
- Summarizing patient-reported symptoms
- Identifying possible red flags
- Suggesting a preliminary priority level
- Returning structured JSON
- Supporting staff confirmation or override
- Saving and retrieving queue records when connected to DynamoDB

## Important Safety Rule

The system must not diagnose patients or replace healthcare professionals.

Amazon Bedrock only provides decision support. A trained healthcare worker must review, confirm, or override every priority suggestion.

## Suggested Structure

```text
services/triage/
├── src/
│   ├── handlers/
│   ├── bedrock/
│   ├── queue/
│   ├── validation/
│   └── utils/
├── tests/
├── package.json
└── README.md