# MediQueue AI - Database Design

MediQueue AI uses Amazon DynamoDB as its primary, highly scalable, serverless data store. This document details the database schema, indexes, and write behaviors.

---

## 1. Primary Table Schema (`PatientsTable`)

The database uses a single-table design format with partition and sort keys to manage patient records and sequence sequences.

* **Partition Key (`PK`)**: `patientId` (String, UUID v4 format)
* **Sort Key (`SK`)**: `recordType` (String)
  * Patient check-in records use `PATIENT_CHECKIN`.
  * The daily check-in counter uses `DAILY_COUNTER`.

### Attribute Map - Patient Record (`PATIENT_CHECKIN`)

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `patientId` | String | Unique UUID v4 for the check-in session. |
| `queueNumber` | String | Structured chronological ticket ID (e.g. `MQ-20260624-0017`). |
| `fullName` | String | Patient's full name (kept encrypted/unshared with AI). |
| `phoneNumber` | String | Patient's phone number (kept encrypted/unshared with AI). |
| `sex` | String | Patient's gender: `MALE`, `FEMALE`, or `PREFER_NOT_TO_SAY`. |
| `age` | Number | Patient's age in years. |
| `symptoms` | List (Strings) | Selected symptom tags. |
| `selfAssessedUrgency` | String | Patient's self-assessment: `MINOR`, `MODERATE`, or `URGENT`. |
| `additionalDetails` | String | Patient-entered text description (stripped of PII before AI processing). |
| `status` | String | Queue status: `WAITING`, `IN_PROGRESS`, or `COMPLETED`. |
| `aiAssessment` | Map | Bedrock-generated summary, red flags list, suggested priority, reasoning, and review flags. |
| `staffDecision` | Map | Staff-confirmed priority, reviewedAt timestamp, and overrideReason comments. |
| `escalated` | Boolean | Triage nurse escalation indicator flag. |
| `escalatedBy` | String | Coordinator username who escalated the record. |
| `createdAt` | String | ISO 8601 creation timestamp. |
| `updatedAt` | String | ISO 8601 modification timestamp (used for conditional updates). |

### Attribute Map - Daily Counter (`DAILY_COUNTER`)

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `PK` | String | Static ID representing the date (e.g. `COUNTER#20260624`). |
| `SK` | String | `DAILY_COUNTER`. |
| `currentValue` | Number | Integer counter used to generate chronological sequence suffix. |

---

## 2. Global Secondary Indexes (GSIs)

To enable efficient query lists for the staff dashboard, a GSI is configured to project queue records filtered by status and chronological order.

### `QueueIndex`

* **Partition Key (`GSI_PK`)**: `checkinDate` (String format: `YYYY-MM-DD`)
* **Sort Key (`GSI_SK`)**: `createdAt` (String ISO 8601 timestamp)
* **Projection**: `KEYS_ONLY` or selected attributes:
  * Projected attributes: `patientId`, `queueNumber`, `fullName`, `age`, `status`, `aiAssessment` (summarized attributes only), `staffDecision.confirmedPriority`, `escalated`, `createdAt`.
  * Excluded attributes to save throughput: full `symptoms` lists, `phoneNumber` credentials, `additionalDetails` descriptions.

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
