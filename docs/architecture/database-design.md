# MediQueue AI - Database Design

MediQueue AI uses Amazon DynamoDB as its primary, highly scalable, serverless data store. This document details the database schema, indexes, and write behaviors.

---

## 1. Primary Table Schema (`PatientsTable`)

The database uses a single-table design format with a simple partition key to manage patient records and sequence sequences.

* **Primary Partition Key (`id`)**: String (e.g. `PATIENT#<patientId>` or `COUNTER#<dateStr>`)
* **Sort Key**: None (utilizes a simple primary key structure)

### Attribute Map - Patient Record (`PATIENT_CHECKIN`)

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Partition key (e.g. `PATIENT#<patientId>`). |
| `entityType` | String | Hardcoded to `PATIENT_CHECKIN`. |
| `patientId` | String | Unique UUID v4 for the check-in session. |
| `queueNumber` | String | Structured chronological ticket ID (e.g. `MQ-20260624-0017`). |
| `fullName` | String | Patient's full name (kept encrypted/unshared with AI). |
| `phoneNumber` | String | Patient's phone number (kept encrypted/unshared with AI). |
| `sex` | String | Patient's gender: `Male`, `Female`, or `Prefer not to say`. |
| `age` | Number | Patient's age in years. |
| `symptoms` | List (Strings) | Selected symptom tags. |
| `selfAssessedUrgency` | String | Patient's self-assessment: `Minor`, `Moderate`, or `Urgent`. |
| `additionalDetails` | String | Patient-entered text description (stripped of PII before AI processing). |
| `status` | String | Queue status: `WAITING`, `IN_PROGRESS`, or `COMPLETED`. |
| `aiAssessment` | Map | Bedrock-generated summary, red flags list, suggested priority, reasoning, and review flags. |
| `staffDecision` | Map | Staff-confirmed priority, reviewedAt timestamp, and overrideReason comments. |
| `isEscalated` | Boolean | Triage nurse escalation indicator flag. |
| `escalatedBy` | String | Coordinator username who escalated the record. |
| `gsi1pk` | String | GSI partition reference key (e.g. `QUEUE#YYYY-MM-DD`). |
| `gsi1sk` | String | GSI sort reference key (e.g. `2026-06-24T00:00:00.000Z#<uuid>`). |
| `createdAt` | String | ISO 8601 creation timestamp. |
| `updatedAt` | String | ISO 8601 modification timestamp (used for conditional updates). |

### Attribute Map - Daily Counter (`DAILY_COUNTER`)

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Partition key (e.g. `COUNTER#20260624`). |
| `entityType` | String | Hardcoded to `DAILY_COUNTER`. |
| `currentValue` | Number | Integer counter used to generate chronological sequence suffix. |
| `updatedAt` | String | ISO 8601 modification timestamp. |

---

## 2. Global Secondary Indexes (GSIs)

To enable efficient query lists for the staff dashboard, a GSI is configured to project queue records filtered by status and chronological order.

### `QueueIndex` (e.g. `gsi1`)

* **Partition Key (`gsi1pk`)**: `QUEUE#YYYY-MM-DD` (String format)
* **Sort Key (`gsi1sk`)**: `createdAt#patientId` (String format, e.g. `2026-06-24T00:00:00.000Z#<uuid>`)
* **Projection**: `INCLUDE`
  * Projected attributes: `entityType`, `patientId`, `queueNumber`, `fullName`, `age`, `status`, `aiAssessment`, `staffDecision`, `createdAt`, `isEscalated`, `escalatedBy`.
  * Excluded attributes to save throughput: full `symptoms` lists, `phoneNumber` credentials, `additionalDetails` descriptions, `sex`, and `selfAssessedUrgency`.

---

## 3. Concurrency & Write Protections

### 3.1 Optimistic Locking
To prevent staff coordinators from overwriting each other's triage decisions in a multi-user clinical setting, all PATCH writes are conditioned on `updatedAt`:
* When retrieving a record, the client reads the `updatedAt` timestamp.
* On write, the DynamoDB update command contains a conditional expression:
  `ConditionExpression: "updatedAt = :expectedUpdatedAt"`
* If the write fails due to `ConditionalCheckFailedException`, it indicates another coordinator has modified the record first. The API yields a `409 UPDATE_CONFLICT` code, prompting the client to refresh.

### 3.2 Sequence Counter Atomicity
Daily counters are incremented using DynamoDB atomic operations:
* `UpdateItem` with expression `SET currentValue = currentValue + :inc`
* Returns the new value atomically to prevent duplicate ticket generation.
