# MediQueue Triage Service & Patient Check-In API

This folder contains the backend, Amazon Bedrock triage-support logic, and the Patient Check-In API handler.

The primary goal of this service is to receive patient check-ins, validate details, call Bedrock to generate a symptom summary and priority suggestion, assign a sequential queue number, and persist the record in DynamoDB.

---

## Important Safety Rules

> [!IMPORTANT]
> **NO DIAGNOSIS:** This service MUST NOT diagnose the patient. It must not mention potential disease names, syndromes, or medical conditions.
>
> **DECISION SUPPORT ONLY:** Amazon Bedrock only provides decision support. A trained healthcare worker must review, confirm, or override every suggested priority before taking action.
>
> **STAFF PRIORITIZATION BOUNDARY:** Stored records clearly separate the AI suggestion (`aiAssessment.suggestedPriority`) from the staff decision (`staffDecision.confirmedPriority`). The suggestion is never automatically promoted to confirmed priority.
>
> **FAIL CLOSED:** If validation of the Bedrock response or the request body fails, the execution terminates immediately and no data is saved to DynamoDB.
>
> **DUMMY DATA ONLY:** Only use dummy patient data during development and testing. Do not commit or transmit real patient information.

---

## Structure

```text
services/triage/
├── src/
│   ├── bedrock/
│   │   ├── client.mjs                    # Bedrock client instantiation
│   │   ├── prompt.mjs                    # System prompt and input formatter
│   │   └── analyse-symptoms.mjs          # Core symptom analysis pipeline
│   ├── errors/
│   │   ├── triage-error.mjs              # Custom error definition for Bedrock
│   │   └── checkin-error.mjs             # Custom error definition for API/Check-in
│   ├── handlers/
│   │   └── create-checkin.mjs            # AWS Lambda Proxy Handler entrypoint
│   ├── queue/
│   │   └── generate-queue-number.mjs      # Atomic queue counter logic
│   ├── repositories/
│   │   └── patient-repository.mjs        # DynamoDB CRUD operations
│   ├── responses/
│   │   └── api-response.mjs              # HTTP response helper
│   ├── services/
│   │   └── create-checkin-service.mjs    # Business service orchestration
│   └── validation/
│       ├── validate-patient-input.mjs    # Symptom details validation
│       ├── validate-triage-response.mjs  # Bedrock response schema checks
│       └── validate-checkin-request.mjs  # Check-in request schema checks
├── tests/
│   ├── triage-validation.test.mjs        # Offline Bedrock/validation tests
│   └── create-checkin.test.mjs           # Offline check-in logic tests
├── bedrock-test.mjs                      # Live integration test runner
├── package.json
└── README.md
```

---

## DynamoDB Global Secondary Index (GSI) Contract

To support efficient date-based first-come-first-served queries for the hospital staff dashboard without scanning the table, the table must be configured with a Global Secondary Index (GSI) matching this contract:

* **Index Name**: `gsi1` (or as configured in infrastructure)
* **Partition Key (GSI PK)**: `gsi1pk` (Type: String)
  - Format: `QUEUE#YYYY-MM-DD`
* **Sort Key (GSI SK)**: `gsi1sk` (Type: String)
  - Format: `createdAt_timestamp#patientId` (e.g. `2026-06-23T14:30:00.000Z#patient-uuid`)

*Note: Daily counter items (`id = COUNTER#YYYYMMDD`) must not include GSI attributes (`gsi1pk`/`gsi1sk`), keeping the GSI sparse and performant.*

---

## API Specifications (POST `/check-ins`)

### Request Body Example
```json
{
  "fullName": "Demo Patient",
  "age": 31,
  "phoneNumber": "0200000000",
  "symptoms": [
    "Weakness",
    "Dizziness"
  ],
  "additionalDetails": "Symptoms started several hours ago."
}
```

### Success Response Example (HTTP 201)
```json
{
  "success": true,
  "data": {
    "patientId": "e2ba9317-a02d-45db-9c3f-4e09f584fa71",
    "queueNumber": "MQ-20260623-0001",
    "status": "WAITING",
    "aiAssessment": {
      "summary": "Patient reports weakness and dizziness.",
      "redFlags": [],
      "suggestedPriority": "MEDIUM",
      "reason": "Symptom descriptions require timely review.",
      "requiresImmediateStaffReview": true
    },
    "createdAt": "2026-06-23T14:30:00.000Z"
  }
}
```

### Controlled Error Responses
Error payloads are standardized to avoid leaking stack traces or internal AWS infrastructure details:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | INVALID_JSON | TRIAGE_PROCESSING_ERROR | QUEUE_NUMBER_ERROR | DATABASE_ERROR | CONFIGURATION_ERROR | INTERNAL_ERROR",
    "message": "Client safe error description"
  }
}
```

---

## Execution Instructions

First, ensure that the package dependencies are installed:
```bash
npm install
```

### 1. Run All Offline Unit and Logic Tests
Verify input validations, response parsing, counter generation, and service workflow logic offline using injected mock dependencies:
```bash
npm test
```
*(Alternatively, run `npm run test:triage` or `npm run test:checkin` to target specific test suites).*

---

## Known Limitations & Future Improvements

* **Request Idempotency**: Request idempotency is not implemented. Repeating the same check-in request may create multiple patient records and allocate a different queue number for each submission.