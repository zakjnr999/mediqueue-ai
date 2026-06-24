# MediQueue Triage Service & Staff Queue API

This folder contains the backend, Amazon Bedrock triage-support logic, and Lambda handlers for both patient check-ins and staff queue dashboard endpoints.

---

## Important Safety and Security Rules

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
>
> **STAFF AUTHENTICATION LIMITATION:** Staff authentication is not implemented in this milestone. These endpoints must not be exposed publicly in production without authentication and authorization.

---

## GSI Eventual Consistency & Consistent Reads

- **GET /queue (Eventually Consistent)**: Global secondary index reads are eventually consistent. A newly created or updated check-in may take a short time to appear in the staff queue because the queue is read through a DynamoDB Global Secondary Index.
- **GET /patients/{patientId} (Strongly Consistent)**: Detail retrievals fetch the check-in record directly from the base table using a strongly consistent read (`ConsistentRead: true`) to ensure the latest status is immediately loaded.

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
│   │   ├── checkin-error.mjs             # Custom error definition for Check-in
│   │   └── api-error.mjs                 # Custom error definition for Staff APIs
│   ├── handlers/
│   │   ├── create-checkin.mjs            # AWS Lambda Proxy Handler for POST /check-ins
│   │   ├── get-queue.mjs                 # AWS Lambda Proxy Handler for GET /queue
│   │   └── get-patient.mjs               # AWS Lambda Proxy Handler for GET /patients/{id}
│   ├── pagination/
│   │   └── pagination-token.mjs          # base64url pagination token serializer
│   ├── queue/
│   │   └── generate-queue-number.mjs      # Atomic queue counter logic
│   ├── repositories/
│   │   └── patient-repository.mjs        # DynamoDB CRUD operations (Query & Get)
│   ├── responses/
│   │   └── api-response.mjs              # HTTP response helper
│   ├── services/
│   │   ├── create-checkin-service.mjs    # Check-in business service
│   │   ├── get-queue-service.mjs         # Queue list retrieval service
│   │   └── get-patient-service.mjs       # Patient details retrieval service
│   └── validation/
│       ├── validate-patient-input.mjs    # Symptom details validation
│       ├── validate-triage-response.mjs  # Bedrock response schema checks
│       ├── validate-checkin-request.mjs  # Check-in request schema checks (incl. sex & selfAssessedUrgency)
│       ├── validate-queue-query.mjs      # Queue parameter validations (incl. status & hasRedFlags)
│       ├── validate-priority-update.mjs  # Priority update validation (incl. reviewerDisplayName)
│       └── validate-patient-id.mjs       # UUID v4 structural validation
├── tests/
│   ├── triage-validation.test.mjs        # Offline Bedrock/validation tests
│   ├── create-checkin.test.mjs           # Offline check-in handler tests
│   └── queue-details.test.mjs            # Offline staff queue handler tests
├── bedrock-test.mjs                      # Live integration test runner
├── package.json
└── README.md
```

---

## Environment Variables

The following environment variables are required:

| Variable | Description | Example / Placeholder |
| :--- | :--- | :--- |
| `BEDROCK_MODEL_ID` | The exact Amazon Bedrock model ID. **(Required)** | `us.amazon.nova-lite-v1:0` (placeholder) |
| `AWS_REGION` | The AWS Region to target (defaults to `us-west-2`). | `us-west-2` (placeholder) |
| `PATIENTS_TABLE_NAME` | The DynamoDB table name for storing check-in records. | `MediQueuePatientsTable-Dev` |
| `PATIENTS_QUEUE_INDEX_NAME` | The name of the GSI queue index. | `gsi1` |

---

## DynamoDB Index Contracts

### Global Secondary Index (GSI)
To support sorting by check-in time (`createdAt`), configure `PATIENTS_QUEUE_INDEX_NAME` as:
- **Partition Key**: `gsi1pk` (Type: String, e.g. `QUEUE#YYYY-MM-DD`)
- **Sort Key**: `gsi1sk` (Type: String, e.g. `2026-06-23T14:30:00.000Z#uuid`)
- **Projection Type**: `INCLUDE`
- **Projected Attributes**: `entityType`, `patientId`, `queueNumber`, `fullName`, `age`, `status`, `aiAssessment`, `staffDecision`, `createdAt`

---

## API Endpoints

### 1. POST `/check-ins` (Patient Check-in)
Submits a symptom report and generates a wait ticket.
- **Request Body**: Name, age, phone number, symptoms list, details.
- **Optional Fields**: `sex` (Male/Female/Prefer not to say), `selfAssessedUrgency` (Minor/Moderate/Urgent).
- **Privacy Rules**: `sex` and `selfAssessedUrgency` are stored in DynamoDB but **never** sent to Bedrock or exposed in the queue list. Bedrock receives only `{ age, symptoms, additionalDetails }`.
- **Response**: Assigned queue number, status, AI assessment, uuid, and optionally `sex`/`selfAssessedUrgency` if provided.

### 2. GET `/queue` (Staff Queue List)
Retrieves the check-in queue list for a specific date.
- **Query Parameters**:
  - `date` (Optional): `YYYY-MM-DD` (UTC). Defaults to current date.
  - `limit` (Optional): Number between 1 and 50 (defaults to 20).
  - `nextToken` (Optional): Opaque token bound to active filters.
  - `status` (Optional): Filter by `WAITING`, `IN_PROGRESS`, or `COMPLETED` (applied in-memory after query).
  - `hasRedFlags` (Optional): `"true"` or `"false"` to filter by presence of red flags (applied in-memory after query).
- **Pagination v2**: Tokens include filter context (`status`, `hasRedFlags`). Mismatched filter values between token and request are rejected.
- **Filter Semantics**: Filtering is applied in-memory after DynamoDB query. Combined with pagination, the nextToken captures active filter values to prevent drift.
- **Response Payload**:
```json
{
  "success": true,
  "data": {
    "date": "2026-06-23",
    "patients": [
      {
        "patientId": "e2ba9317-a02d-45db-9c3f-4e09f584fa71",
        "queueNumber": "MQ-20260623-0001",
        "fullName": "Demo Patient",
        "age": 31,
        "status": "WAITING",
        "aiAssessment": {
          "summary": "Patient reports weakness.",
          "redFlags": [],
          "suggestedPriority": "MEDIUM",
          "requiresImmediateStaffReview": true
        },
        "staffDecision": {
          "confirmedPriority": null
        },
        "createdAt": "2026-06-23T14:30:00.000Z"
      }
    ],
    "nextToken": null
  }
}
```

### 3. GET `/patients/{patientId}` (Staff Patient Details)
Retrieves the full check-in record details.
- **Sensitive fields**: `sex` and `selfAssessedUrgency` are included here (patient details only), omitted from queue list.
- **Response Payload**:
```json
{
  "success": true,
  "data": {
    "patientId": "e2ba9317-a02d-45db-9c3f-4e09f584fa71",
    "queueNumber": "MQ-20260623-0001",
    "fullName": "Demo Patient",
    "age": 31,
    "phoneNumber": "0200000000",
    "symptoms": ["Weakness", "Dizziness"],
    "additionalDetails": "Symptoms started several hours ago.",
    "aiAssessment": {
      "summary": "Patient reports weakness.",
      "redFlags": [],
      "suggestedPriority": "MEDIUM",
      "reason": "Staff review is required.",
      "requiresImmediateStaffReview": true
    },
    "staffDecision": {
      "confirmedPriority": null,
      "reviewedBy": null,
      "reviewedAt": null,
      "overrideReason": null,
      "reviewerDisplayName": null
    },
    "status": "WAITING",
    "createdAt": "2026-06-23T14:30:00.000Z",
    "updatedAt": "2026-06-23T14:30:00.000Z"
  }
}
```

### 4. PATCH `/patients/{patientId}/priority` (Staff Priority Review)
Updates the triage priority confirmed by staff.
- **Request Body**:
```json
{
  "confirmedPriority": "HIGH",
  "overrideReason": "Patient condition requires faster staff attention."
}
```
- **Rules**:
  - `confirmedPriority` must be string and one of `HIGH`, `MEDIUM`, `LOW`.
  - `overrideReason` is required if `confirmedPriority` differs from `aiAssessment.suggestedPriority` (trimmed string, max 500 chars). Normalizes to `null` if empty/omitted and priority matches.
  - `reviewerDisplayName` (Optional, max 100 chars): Display name of the reviewing staff member. Stored unverified as a display label.
  - `reviewedBy` is **rejected** from client input (reserved for future auth). `staffDecision.reviewedBy` remains `null`.
  - Concurrency Check: Update is conditional on `updatedAt` matching the timestamp retrieved during consistent read.
- **Response Payload**:
```json
{
  "success": true,
  "data": {
    "patientId": "e2ba9317-a02d-45db-9c3f-4e09f584fa71",
    "queueNumber": "MQ-20260623-0001",
    "aiSuggestedPriority": "MEDIUM",
    "staffDecision": {
      "confirmedPriority": "HIGH",
      "reviewedAt": "2026-06-23T16:00:00.000Z",
      "overrideReason": "Patient condition requires faster staff attention."
    },
    "status": "WAITING",
    "updatedAt": "2026-06-23T16:00:00.000Z"
  }
}
```

### 5. PATCH `/patients/{patientId}/status` (Patient Status Update)
Transitions the status of a patient in the hospital queue.
- **Request Body**:
```json
{
  "status": "IN_PROGRESS"
}
```
- **Rules**:
  - `status` must be WAITING, IN_PROGRESS, or COMPLETED.
  - Forward-only transitions strictly enforced: `WAITING -> IN_PROGRESS` and `IN_PROGRESS -> COMPLETED`.
  - Concurrency Check: Update is conditional on the stored `status` matching the expected status read before modification. Same-status updates throw `INVALID_STATUS_TRANSITION`.
- **Response Payload**:
```json
{
  "success": true,
  "data": {
    "patientId": "e2ba9317-a02d-45db-9c3f-4e09f584fa71",
    "queueNumber": "MQ-20260623-0001",
    "status": "IN_PROGRESS",
    "updatedAt": "2026-06-23T16:05:00.000Z"
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
Verify check-in, queue, details, validations, pagination tokens, priority reviews, status transitions, and handler proxy logic offline using injected mock dependencies:
```bash
npm test
```
*(Alternatively, run `npm run test:triage`, `npm run test:checkin`, `npm run test:queue`, or `npm run test:staff-actions` to target specific test suites).*

---

## Known Limitations

* **Request Idempotency**: Repeated check-in submissions by a client screen will allocate duplicate queue numbers and store duplicate records.
* **Pagination Token Security**: Pagination tokens are validated, date-bound, and filter-bound but are not cryptographically signed in this hackathon milestone.
* **Staff Authentication**: No authentication or authorization is configured for staff endpoints in this milestone. `reviewedBy` remains `null`; `reviewerDisplayName` is an unverified display label only. Do not expose these endpoints publicly in production without configuring security scopes.
* **In-Memory Filtering**: `status` and `hasRedFlags` filters are applied in-memory after DynamoDB query. Large datasets with restrictive filters may return fewer results than the requested `limit`.