# AWS Deployment Handoff Guide - MediQueue AI Backend Services

This document details the configuration, permissions, architecture, and packaging parameters required to deploy the MediQueue AI backend to AWS. It serves as a handoff guide for the AWS/Cloud engineering teammate.

---

## 1. Lambda Handler Entrypoints

All handlers are configured as **ES modules (`.mjs`)** and expose a standard async `handler` function.

| HTTP Method | Route | File Path | Exported Handler | Purpose | Required Env Variables | Required Permissions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **POST** | `/check-ins` | `services/triage/src/handlers/create-checkin.mjs` | `handler` | Validates patient input, requests Bedrock symptom assessment (PII-stripped), atomically increments daily counter, and saves patient record. | `AWS_REGION`, `PATIENTS_TABLE_NAME`, `BEDROCK_MODEL_ID` | `bedrock:InvokeModel`, `dynamodb:UpdateItem` (counter), `dynamodb:PutItem` (patient) |
| **GET** | `/queue` | `services/triage/src/handlers/get-queue.mjs` | `handler` | Retrieves patient queue list for a given date from GSI, filtered by WAITING/IN_PROGRESS/COMPLETED statuses. Supports opaque Base64url pagination tokens. | `AWS_REGION`, `PATIENTS_TABLE_NAME`, `PATIENTS_QUEUE_INDEX_NAME` | `dynamodb:Query` (GSI index) |
| **GET** | `/patients/{patientId}` | `services/triage/src/handlers/get-patient.mjs` | `handler` | Retrieves full check-in record details using strongly consistent table read. | `AWS_REGION`, `PATIENTS_TABLE_NAME` | `dynamodb:GetItem` (patient) |
| **PATCH** | `/patients/{patientId}/priority` | `services/triage/src/handlers/update-priority.mjs` | `handler` | Saves staff confirmed priority and override reasons, protected by concurrency timestamp validations. | `AWS_REGION`, `PATIENTS_TABLE_NAME` | `dynamodb:GetItem`, `dynamodb:UpdateItem` (patient) |
| **PATCH** | `/patients/{patientId}/status` | `services/triage/src/handlers/update-status.mjs` | `handler` | Updates queue status forward-only (`WAITING → IN_PROGRESS → COMPLETED`), protected by race-condition checks. | `AWS_REGION`, `PATIENTS_TABLE_NAME` | `dynamodb:GetItem`, `dynamodb:UpdateItem` (patient) |

---

## 2. API Routes Documentation

### 2.1 POST `/check-ins`
Submits a clinical check-in ticket.
* **Bedrock Privacy Rule**: The patient's `fullName` and `phoneNumber` are kept strictly inside the DynamoDB store. **Only** `age`, `symptoms`, and `additionalDetails` are transmitted to the Amazon Bedrock model.
* **Sample Request**:
  ```json
  {
    "fullName": "John Doe",
    "age": 35,
    "phoneNumber": "0201112222",
    "symptoms": ["Shortness of breath", "Chest tightness"],
    "additionalDetails": "Symptoms started during exercise.",
    "sex": "Male",
    "selfAssessedUrgency": "Urgent"
  }
  ```
* **Success Response (HTTP 201)**:
  ```json
  {
    "success": true,
    "data": {
      "patientId": "550e8400-e29b-41d4-a716-446655440000",
      "queueNumber": "MQ-20260624-0001",
      "status": "WAITING",
      "aiAssessment": {
        "summary": "Patient reports shortness of breath...",
        "redFlags": ["Shortness of breath", "Chest tightness"],
        "suggestedPriority": "HIGH",
        "reason": "Red flag symptoms require immediate review.",
        "requiresImmediateStaffReview": true
      },
      "sex": "Male",
      "selfAssessedUrgency": "Urgent",
      "createdAt": "2026-06-24T00:00:00.000Z"
    }
  }
  ```
* **Controlled Error Codes**:
  * `400 INVALID_JSON` (Malformed body payload)
  * `400 VALIDATION_ERROR` (Invalid age range, empty symptoms list, invalid sex/urgency value, text length violations)
  * `500 TRIAGE_PROCESSING_ERROR` (Bedrock model invocation failure)
  * `500 QUEUE_NUMBER_ERROR` (Counter sequence failure)
  * `500 DATABASE_ERROR` (Conditional put conflict or AWS network drop)

---

### 2.2 GET `/queue`
Queries patients listed on the staff dashboard queue for a specific day.
* **Eventual Consistency**: Reads query a **Global Secondary Index (GSI)**, which is eventually consistent. A newly checked-in patient may take a moment to be projected into the results.
* **Query Parameters**:
  * `date` (Optional): `YYYY-MM-DD` (defaults to current UTC date).
  * `limit` (Optional): Integer between 1 and 50 (defaults to 20).
  * `nextToken` (Optional): Base64url encoded opaque pagination token (v2 — bound to active filters).
  * `status` (Optional): Filter by `WAITING`, `IN_PROGRESS`, or `COMPLETED` (in-memory).
  * `hasRedFlags` (Optional): `"true"` or `"false"` to filter by presence of red flags (in-memory).
* **Public Attributes Returned**: Only maps queue-relevant fields. Excludes PII details (`fullName` and `phoneNumber` are projects of GSI index and are mapped, but `symptoms`, `additionalDetails`, `sex`, `selfAssessedUrgency`, and DynamoDB keys are stripped).
* **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "data": {
      "date": "2026-06-24",
      "patients": [
        {
          "patientId": "550e8400-e29b-41d4-a716-446655440000",
          "queueNumber": "MQ-20260624-0001",
          "fullName": "John Doe",
          "age": 35,
          "status": "WAITING",
          "aiAssessment": {
            "summary": "Patient reports shortness of breath...",
            "redFlags": ["Shortness of breath", "Chest tightness"],
            "suggestedPriority": "HIGH",
            "requiresImmediateStaffReview": true
          },
          "staffDecision": {
            "confirmedPriority": null
          },
          "createdAt": "2026-06-24T00:00:00.000Z"
        }
      ],
      "nextToken": "eyJ2IjoyLCJkYXRlIjoiMjAyNi0wNi0yNCIsImZpbHRlcnMiOnt9LCJrZXkiOnt9fQ"
    }
  }
  ```

---

### 2.3 GET `/patients/{patientId}`
Retrieves a detailed view card of a patient's symptoms and triage details.
* **Strong Consistency**: Uses `GetCommand` with `ConsistentRead: true` directly against the base table partition key to retrieve the latest status.
* **Sensitive Fields Included**: `sex`, `selfAssessedUrgency`, and `reviewerDisplayName` are included here (patient details only), omitted from the queue list.
* **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "data": {
      "patientId": "550e8400-e29b-41d4-a716-446655440000",
      "queueNumber": "MQ-20260624-0001",
      "fullName": "John Doe",
      "age": 35,
      "phoneNumber": "0201112222",
      "symptoms": ["Shortness of breath", "Chest tightness"],
      "additionalDetails": "Symptoms started during exercise.",
      "sex": "Male",
      "selfAssessedUrgency": "Urgent",
      "aiAssessment": {
        "summary": "Patient reports shortness of breath...",
        "redFlags": ["Shortness of breath", "Chest tightness"],
        "suggestedPriority": "HIGH",
        "reason": "Red flag symptoms require immediate review.",
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
      "createdAt": "2026-06-24T00:00:00.000Z",
      "updatedAt": "2026-06-24T00:00:00.000Z"
    }
  }
  ```
* **Controlled Error Codes**:
  * `400 VALIDATION_ERROR` (Malformed UUID v4, contains path traversal or injections)
  * `404 PATIENT_NOT_FOUND` (Record doesn't exist or is a `DAILY_COUNTER` item instead of `PATIENT_CHECKIN`)

---

### 2.4 PATCH `/patients/{patientId}/priority`
Saves staff priority decision and comments.
* **Override Rule**: `overrideReason` is **required** if the staff `confirmedPriority` differs from `aiAssessment.suggestedPriority`. It is optional and normalized to `null` if the priorities match.
  * `reviewerDisplayName` (Optional): Display name of the reviewing staff member (max 100 chars). Stored unverified.
  * `reviewedBy` is **rejected** from client input (reserved for future auth scoping).
* **Concurrency Check**: Employs optimistic locking. Compares the stored `updatedAt` value fetched during consistent read against the conditional write. If another user commits an update first, it throws `UPDATE_CONFLICT` (HTTP 409).
* **Sample Request**:
  ```json
  {
    "confirmedPriority": "HIGH",
    "overrideReason": "Patient condition requires faster staff attention.",
    "reviewerDisplayName": "Dr. Smith"
  }
  ```
* **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "data": {
      "patientId": "550e8400-e29b-41d4-a716-446655440000",
      "queueNumber": "MQ-20260624-0001",
      "aiSuggestedPriority": "MEDIUM",
      "staffDecision": {
        "confirmedPriority": "HIGH",
        "reviewedAt": "2026-06-24T00:10:00.000Z",
        "overrideReason": "Patient condition requires faster staff attention.",
        "reviewerDisplayName": "Dr. Smith"
      },
      "status": "WAITING",
      "updatedAt": "2026-06-24T00:10:00.000Z"
    }
  }
  ```
* **Controlled Error Codes**:
  * `400 VALIDATION_ERROR` (Invalid priority string, reason exceeds 500 chars, reviewerDisplayName exceeds 100 chars)
  * `400 PRIORITY_OVERRIDE_REASON_REQUIRED` (Omitted override reason on priority changes)
  * `409 UPDATE_CONFLICT` (Concurrency timestamp mismatch)

---

### 2.5 PATCH `/patients/{patientId}/status`
Moves patients forward along queue stages.
* **Allowed Transition Flows**: `WAITING → IN_PROGRESS` and `IN_PROGRESS → COMPLETED` strictly.
* **Invalid Transitions**: Backwards transitions or skipping states (e.g. `WAITING → COMPLETED` or setting to the same current status) throws `INVALID_STATUS_TRANSITION` (HTTP 409).
* **Concurrency Check**: Matches on the stored status. If the patient status changed in a concurrent call, the write fails and throws `UPDATE_CONFLICT`.
* **Sample Request**:
  ```json
  {
    "status": "IN_PROGRESS"
  }
  ```
* **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "data": {
      "patientId": "550e8400-e29b-41d4-a716-446655440000",
      "queueNumber": "MQ-20260624-0001",
      "status": "IN_PROGRESS",
      "updatedAt": "2026-06-24T00:12:00.000Z"
    }
  }
  ```

---

## 3. DynamoDB Table Contract

Deploy a single DynamoDB table matching the primary key schema and index definitions below:

### 3.1 Main Table (Base Table)
* **Primary Partition Key**: `id` (Type: String)
* **Attribute Types**:
  * `PATIENT_CHECKIN`: Represents an active patient ticket.
  * `DAILY_COUNTER`: An atomic sequence counter tracking wait-ticket allocations.

### 3.2 Patient Check-In Item Schema (`PATIENT_CHECKIN`)
* `id` (String PK, e.g. `PATIENT#<uuid>`)
* `entityType` (String, hardcoded to `"PATIENT_CHECKIN"`)
* `patientId` (String, standard UUID v4 format)
* `queueNumber` (String, wait ticket ID, e.g. `MQ-20260624-0001`)
* `fullName` (String, max 100 characters)
* `age` (Number, 0 to 120 integer)
* `phoneNumber` (String, **Optional**, trimmed string)
* `additionalDetails` (String, **Optional**, max 1000 characters)
* `sex` (String, **Optional**: `Male`, `Female`, `Prefer not to say` — sensitive, excluded from GSI projection)
* `selfAssessedUrgency` (String, **Optional**: `Minor`, `Moderate`, `Urgent` — patient self-report, excluded from GSI projection)
* `symptoms` (Array of Strings, 1 to 20 entries)
* `additionalDetails` (String, **Optional**, max 1000 characters)
* `queueDate` (String, date reference, `YYYY-MM-DD`)
* `gsi1pk` (String GSI partition reference, e.g. `QUEUE#YYYY-MM-DD`)
* `gsi1sk` (String GSI sort reference, e.g. `2026-06-24T00:00:00.000Z#<uuid>`)
* `aiAssessment` (Map):
  * `summary` (String)
  * `redFlags` (Array of Strings)
  * `suggestedPriority` (String: `HIGH`, `MEDIUM`, `LOW`)
  * `reason` (String)
  * `requiresImmediateStaffReview` (Boolean)
* `staffDecision` (Map):
  * `confirmedPriority` (String/null)
  * `reviewedBy` (String/null, always null for this milestone)
  * `reviewedAt` (String/null, ISO format)
  * `overrideReason` (String/null)
  * `reviewerDisplayName` (String/null, unverified display label, max 100 chars)
* `status` (String: `WAITING`, `IN_PROGRESS`, `COMPLETED`)
* `createdAt` (String, ISO timestamp)
* `updatedAt` (String, ISO timestamp)

### 3.3 Counter Item Schema (`DAILY_COUNTER`)
* `id` (String PK, format: `COUNTER#YYYYMMDD` where YYYYMMDD is UTC date)
* `entityType` (String, value: `"DAILY_COUNTER"`)
* `currentValue` (Number, atomically incremented daily)
* `updatedAt` (String, ISO timestamp of last increment)
* **GSI Limitation**: Daily counter items **must not** contain GSI keys (`gsi1pk` or `gsi1sk`). This avoids cluttering index projections with non-patient records.

### 3.4 Global Secondary Index (GSI)
* **Index Name**: Configured via env `PATIENTS_QUEUE_INDEX_NAME` (e.g. `gsi1`).
* **Partition Key**: `gsi1pk` (String)
* **Sort Key**: `gsi1sk` (String)
* **Projection Type**: `INCLUDE`
* **Projected Attributes**: `entityType`, `patientId`, `queueNumber`, `fullName`, `age`, `status`, `aiAssessment`, `staffDecision`, `createdAt`
  * **Note**: `sex` and `selfAssessedUrgency` are intentionally excluded from GSI projection (sensitive fields, patient-details only).
* **Queue Order Behavior**: Querying by `gsi1pk = QUEUE#YYYY-MM-DD` and sorting ascending (ScanIndexForward = true) returns patients ordered by check-in time (First-Come, First-Served).

---

## 4. IAM Permissions Matrix (Least Privilege)

The minimum IAM permissions required for each Lambda role:

### 4.1 Check-In Lambda Role
* `bedrock:InvokeModel` (Invoke Bedrock Converse API)
* `dynamodb:UpdateItem` (Increment daily counter item)
* `dynamodb:PutItem` (Write conditional patient check-in)
* `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### 4.2 Queue List Lambda Role
* `dynamodb:Query` (Read on the GSI index specified by `PATIENTS_QUEUE_INDEX_NAME`)
* `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### 4.3 Patient Details Lambda Role
* `dynamodb:GetItem` (Strongly consistent base table read)
* `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### 4.4 Priority Update Lambda Role
* `dynamodb:GetItem` (Base table read)
* `dynamodb:UpdateItem` (Conditional update of staffDecision attributes matching stored updatedAt)
* `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### 4.5 Status Update Lambda Role
* `dynamodb:GetItem` (Base table read)
* `dynamodb:UpdateItem` (Conditional update of status attributes matching stored status)
* `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

---

## 5. Runtime and Packaging Requirements

* **Runtime Environment**: Node.js 20.x or 22.x (ES Modules supported).
* **Package Manager**: npm.
* **Production Dependencies** (from `package.json`):
  * `@aws-sdk/client-bedrock-runtime` (`^3.1075.0`)
  * `@aws-sdk/client-dynamodb` (`^3.1075.0`)
  * `@aws-sdk/lib-dynamodb` (`^3.1075.0`)
* **Working Directory**: Package zip files must be created relative to `services/triage/`.
* **Packaging Instructions**:
  * Include production `node_modules`. Run:
    ```bash
    npm install --omit=dev
    ```
  * Package all source directories (`src/`), custom error types, validators, response wrappers, and dependency configuration files.
  * Omit mock test directories (`tests/`) from the deployment package.

---

## 6. Environment Variables Matrix

These variables must be populated on the corresponding Lambda configurations:

| Variable | Required by | Status | Example Placeholder | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `AWS_REGION` | All Functions | Optional | `us-west-2` | Targets target Bedrock and DynamoDB instances (defaults to `us-west-2`). |
| `BEDROCK_MODEL_ID` | Check-in Lambda | Required | `us.amazon.nova-lite-v1:0` | The exact active model/profile ID in Bedrock Converse API. |
| `PATIENTS_TABLE_NAME` | All Functions | Required | `MediQueuePatientsTable-Dev` | Target Base table name. |
| `PATIENTS_QUEUE_INDEX_NAME` | Queue List Lambda | Required | `gsi1` | Target Global Secondary Index name. |

*Warning: Never bake AWS access credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) directly into deployment packages or environment variables. Execution roles must supply these.*

---

## 7. Deployment Verification Checklist

The AWS teammate should check off the following tasks before handover:

- [ ] DynamoDB Base table created with primary string partition key `id`.
- [ ] Global Secondary index created with string PK `gsi1pk`, string SK `gsi1sk`, projection type `INCLUDE`, and required projected keys.
- [ ] Amazon Bedrock model configured and model access enabled in the target region.
- [ ] IAM roles configured for five execution lambdas adhering to least privilege.
- [ ] Environment variables configured correctly on all lambdas (verifying indices and tables).
- [ ] AWS API Gateway proxy paths linked correctly to the five Lambda handlers.
- [ ] CloudWatch logs generated, confirming no stack traces or PII leak.
- [ ] CORS policies enabled for the frontend dashboard domain.
- [ ] POST `/check-ins` verified (ticket assigned and Bedrock triage populated).
- [ ] GET `/queue` verified (eventually consistent sorting works asc).
- [ ] GET `/patients/{patientId}` verified (strongly consistent detail retrieval).
- [ ] PATCH `/patients/{patientId}/priority` verified (optimistic lock prevents override collision).
- [ ] PATCH `/patients/{patientId}/status` verified (forward-only waittime lifecycle works).
- [ ] **Security Warning**: Staff dashboard endpoints are not publicly exposed without auth (Cognito or IAM Gateway authorizers) in production environments.

---

## 8. End-to-End Smoke-Test Sequence

Test deployment via curl against API Gateway endpoint: `https://<api-id>.execute-api.us-west-2.amazonaws.com`.

### Step 1: Create Patient Check-In
```bash
curl -X POST https://<api-id>.execute-api.us-west-2.amazonaws.com/check-ins \
  -H "content-type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "age": 28,
    "phoneNumber": "0209998888",
    "symptoms": ["Mild headache", "Fever"],
    "additionalDetails": "Symptoms started yesterday."
  }'
```
*(Copy the generated `patientId` from the JSON response).*

### Step 2: Retrieve Queue List
```bash
curl -X GET "https://<api-id>.execute-api.us-west-2.amazonaws.com/queue?limit=10"
```

### Step 3: Retrieve Patient Details
```bash
curl -X GET https://<api-id>.execute-api.us-west-2.amazonaws.com/patients/550e8400-e29b-41d4-a716-446655440000
```

### Step 4: Override or Confirm Priority
If AI triage suggest MEDIUM, and you want to escalate to HIGH:
```bash
curl -X PATCH https://<api-id>.execute-api.us-west-2.amazonaws.com/patients/550e8400-e29b-41d4-a716-446655440000/priority \
  -H "content-type: application/json" \
  -d '{
    "confirmedPriority": "HIGH",
    "overrideReason": "Patient reports worsening symptom profiles."
  }'
```
*(Verify updatedAt value updates to track the review).*

### Step 5: Transition Status to IN_PROGRESS
```bash
curl -X PATCH https://<api-id>.execute-api.us-west-2.amazonaws.com/patients/550e8400-e29b-41d4-a716-446655440000/status \
  -H "content-type: application/json" \
  -d '{
    "status": "IN_PROGRESS"
  }'
```

### Step 6: Transition Status to COMPLETED
```bash
curl -X PATCH https://<api-id>.execute-api.us-west-2.amazonaws.com/patients/550e8400-e29b-41d4-a716-446655440000/status \
  -H "content-type: application/json" \
  -d '{
    "status": "COMPLETED"
  }'
```
