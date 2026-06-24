# Frontend MVP to Backend API Gap Analysis

This document provides a detailed comparison and gap analysis between the **Frontend MVP Screenshot Designs (P1-P4, S0-S5)** and the **existing MediQueue AI Backend Services**.

---

## 1. Patient Panel Analysis

### Screen P1: Personal Information
* **Captured UI Fields**:
  * `Full Name` (Required)
  * `Phone Number` (Required)
  * `Age` (Required)
  * `Sex` (options: *Male, Female, Prefer not to say*)
* **Backend Status & Gaps**:
  * **Gaps**: **`Sex` is not supported.**
    * The backend request validation (`validateCheckinRequest`) rejects any unexpected properties. Sending `sex` will trigger a `400 VALIDATION_ERROR`.
    * The DynamoDB patient schema does not store `sex`.
  * **Recommendation**:
    * Update `validateCheckinRequest` to accept an optional/required `sex` string field (restricted to `Male`, `Female`, or `Prefer not to say`).
    * Save `sex` under the patient record in DynamoDB.

### Screen P2 & P3: Symptoms, Urgency & Review
* **Captured UI Fields**:
  * `Symptoms` (Checkbox selections: *Fever, Cough, Chest pain, Vomiting, Headache, Dizziness, Body aches, Other*)
  * `Describe in your own words` (Optional text description)
  * `How urgent does this feel?` (options: *Minor, Moderate, Urgent*)
* **Backend Status & Gaps**:
  * **Gaps**: **`Self-Assessed Urgency` is not supported.**
    * The backend does not accept or store the patient's self-assessed priority or urgency level.
  * **Recommendation**:
    * Add `selfAssessedUrgency` string field (validation restricted to `Minor`, `Moderate`, `Urgent` or mapped to `LOW`, `MEDIUM`, `HIGH`) in `validateCheckinRequest`.
    * Save this field in the patient record in DynamoDB.

### Screen P4: Checked In Confirmation
* **Displayed UI Fields**:
  * `Queue Number` (e.g., `MQ-20260624-0017`)
  * `Estimated Wait Time` (e.g., `~ 25 minutes`)
  * `Status` (e.g., `Waiting` badge)
  * `People ahead of you` (e.g., `6`)
* **Backend Status & Gaps**:
  * **Gaps**: **`Estimated Wait Time` and `People ahead of you` are missing.**
    * Neither the `POST /check-ins` success payload nor the `GET /patients/{patientId}` response contains wait times or queue position indicators.
  * **Recommendation**:
    * Add `peopleAhead` (integer) and `estimatedWaitTimeMinutes` (integer) to the API response.
    * **Calculation logic**: To calculate `peopleAhead`, query the GSI (`QUEUE#YYYY-MM-DD` partitions) to count the number of patients with `status = 'WAITING'` whose `createdAt` timestamp is earlier than the patient's check-in timestamp.
    * Calculate `estimatedWaitTimeMinutes` as `peopleAhead * 5` (or a configurable average triage duration).

---

## 2. Staff Panel Analysis

### Screen S0: Staff Login
* **Captured UI Fields**:
  * `Email address`
  * `Password`
* **Backend Status & Gaps**:
  * **Gaps**: **Staff Authentication is not implemented.**
    * There is currently no `POST /auth/login` endpoint, user table schema, or password hashing in the backend repository.
  * **Recommendation**:
    * Clarify if authentication will be handled via **AWS Cognito User Pools** (highly recommended, utilizing an API Gateway authorizer) or if a custom Node.js credential checker needs to be implemented.

### Screen S1: Dashboard Home
* **Displayed UI Fields**:
  * **Stats Panel**:
    * `IN QUEUE` (count of patients waiting)
    * `AVG WAIT` (today's average wait time)
    * `RED FLAGS` (count of patients with identified red flags needing review)
    * `SEEN TODAY` (count of completed patients)
  * **Filters**: `All`, `Red flag`, `Waiting`, `In progress`, `Completed`
  * **Sorting**: `Sort: Priority` or `Sort: Time`
  * **Patient Card Briefs**:
    * Sequence/ID label (e.g., `A-014` or similar)
    * Demographics (e.g., `M, 52` or `F, 34`)
    * Relative Check-in Time (e.g., `31 min ago`)
    * Priority/Red flag badge (e.g., `Urgent · Red flag`)
* **Backend Status & Gaps**:
  * **Gap 1: Queue Statistics Endpoint is missing.**
    * The frontend needs to fetch counts for waiting, completed, red flag, and average wait times. There is no endpoint for this.
  * **Gap 2: GSI Query Filtering & Sorting limitations.**
    * The backend `GET /queue` endpoint returns all check-ins for a given date but does not allow filtering by status or red-flag condition on the server side.
    * DynamoDB queries are sorted by check-in time (`gsi1sk`). Sorting by priority (e.g., Urgent first) cannot be done natively at the DB query level in DynamoDB.
  * **Gap 3: Demographic details are incomplete.**
    * The backend doesn't store `sex`, making it impossible to render demographic labels like `M, 52`.
  * **Recommendation**:
    * **Stats**: Add a `GET /queue/stats?date=YYYY-MM-DD` endpoint to query and return aggregate counts.
    * **Filters**: Add optional `status` and `hasRedFlags` query parameters to `GET /queue` to allow server-side filtering.
    * **Sorting**: Recommend performing priority sorting (`Urgent` -> `Moderate` -> `Minor`) in memory on the server service layer or frontend, as DynamoDB GSIs can only order by timestamp.

### Screen S2 & S3: Patient Card (Expanded) & Priority Override Modal
* **UI Actions**:
  * Expand details (`Show patient details`)
  * `Escalate now` button
  * `Mark attending` button
  * `Override priority` button (opens S3 Modal with *Minor, Moderate, Urgent* and *Reason*)
* **Backend Status & Gaps**:
  * **Gap 1: Priority naming mismatch.**
    * The UI displays priority as `Urgent`, `Moderate`, `Minor`.
    * The Bedrock model outputs `HIGH`, `MEDIUM`, `LOW`.
    * The priority update validator (`validatePriorityUpdate`) strictly enforces `HIGH`, `MEDIUM`, or `LOW`.
  * **Gap 2: `Escalate now` action is missing.**
    * The backend does not support an explicit escalation state.
  * **Gap 3: `reviewedBy` is hardcoded to `null`.**
    * The database repository sets `staffDecision.reviewedBy` to `null` hardcoded. There is no way for the staff dashboard to record *which* staff member performed the action (e.g. `Nurse Rhoda`).
  * **Recommendation**:
    * **Priority Mapping**: The frontend should map `HIGH` -> `Urgent`, `MEDIUM` -> `Moderate`, `LOW` -> `Minor` for user presentation, while keeping database values as `HIGH/MEDIUM/LOW`.
    * **reviewedBy**: Update `validatePriorityUpdate` to accept `reviewedBy` (string) in the request body. Save this in DynamoDB and return it in the updated patient object.
    * **Escalate now**: Allow the frontend to escalate a patient by sending `confirmedPriority: "HIGH"` (Urgent) and optionally recording `isEscalated: true` or `escalatedBy` in the staff decision schema.

### Screen S4: Escalated Patient Card
* **Displayed UI Fields & Actions**:
  * Banner: `ESCALATED — IMMEDIATE ATTENTION REQUIRED`
  * Escalation info: `Escalated by: Nurse Rhoda`
  * Actions: `Mark attending` (`status: "IN_PROGRESS"`), `Mark completed` (`status: "COMPLETED"`)
* **Backend Status & Gaps**:
  * **Gaps**: Same as above—requires `reviewedBy` integration to record the nurse's identity, and a way to flag a record as escalated.

---

## Summary of Priority Actions & Schema Updates

If we decide to patch the backend to align directly with the frontend designs, the following updates are recommended:

### A. Database Patient Item Schema (New Fields)
```json
{
  "sex": "Male | Female | Prefer not to say",
  "selfAssessedUrgency": "Minor | Moderate | Urgent",
  "isEscalated": true | false,
  "staffDecision": {
    "confirmedPriority": "HIGH | MEDIUM | LOW",
    "reviewedBy": "Nurse Rhoda",
    "reviewedAt": "ISO-8601 timestamp",
    "overrideReason": "String text"
  }
}
```

### B. Route Enhancements
1. **`POST /check-ins` & `GET /patients/{id}`**:
   * Add `sex` and `selfAssessedUrgency` to request validation.
   * Return `peopleAhead` and `estimatedWaitTimeMinutes` in the response payload.
2. **`GET /queue`**:
   * Add optional query parameters `status` and `hasRedFlags` for server-side filtering.
3. **`GET /queue/stats`** (New Route):
   * Return queue counts and averages:
     ```json
     {
       "inQueue": 14,
       "avgWaitTimeMinutes": 23,
       "redFlags": 2,
       "seenToday": 31
     }
     ```
4. **`PATCH /patients/{id}/priority`**:
   * Allow `reviewedBy` in the request body.
