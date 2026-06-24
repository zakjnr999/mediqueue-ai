# MediQueue AI - Queue Logic & Triage Rules

MediQueue AI uses a hybrid queue management approach designed to balance first-come, first-served (FCFS) check-in efficiency with clinical risk-based prioritization (triage).

---

## 1. Triage Priority Levels

Triage priorities are defined by three desaturated alert categories:

| Priority | Clinical Status | Queue Position Rule | Visual Indicator |
| :--- | :--- | :--- | :--- |
| **HIGH** | Urgent / Alert | Instantly sorted to the top of the waitlist. | Crimson Alert Line |
| **MEDIUM** | Moderate / Evaluation | Positioned ahead of routine patients, following FCFS within the group. | Amber Line |
| **LOW** | Minor / Stable | Handled in chronological FCFS order. | Emerald Line |

---

## 2. Queue Sorting Algorithm

The staff dashboard displays patient queue lists sorted using the following precedence:

1. **Escalation Flag**: Patients with `escalated = true` are always pinned to the top of the queue list, sorted chronologically among themselves.
2. **Priority Level**: HIGH priority patients are listed below escalated ones, followed by MEDIUM, and then LOW.
3. **Chronological check-in time**: Within each priority class, patients are sorted ascending by `createdAt` timestamp (oldest first) to ensure fair treatment.

---

## 3. Simulated Bedrock Triage Rules

The simulated Bedrock AI models assess clinical risk using strict guidelines:

* **Urgent (High) Priority Triggers**:
  * Any match of critical red-flag keywords in symptom tags or description (e.g. chest pain, difficulty breathing, seizure, heavy bleeding, stroke, anaphylaxis).
  * A patient self-assessed urgency selection of `URGENT`.
* **Moderate (Medium) Priority Triggers**:
  * Moderate keywords matched (e.g. fever, vomiting, abdominal pain, migraine, asthma, dehydration, moderate pain).
  * Vulnerable age brackets: Infants (`age < 2`) and Elderly (`age > 75`).
  * A patient self-assessed urgency selection of `MODERATE`.
* **Minor (Low) Priority**:
  * Default state for routine symptoms and stable conditions.

---

## 4. Staff Decision Rights & Overrides

Amazon Bedrock provides clinical decision support. The final triage decision is strictly reserved for human clinical operators.

### 4.1 Confirmed Priority Override
* A triage nurse can confirm the AI-suggested priority level or override it.
* **Clinical Safety Rule**: If the confirmed priority differs from the AI-suggested priority, the coordinator **must** provide a detailed text explanation (`overrideReason`) before submitting the write command. This ensures audit accountability.

### 4.2 Status Lifecycle transitions
Patient queue statuses transition strictly forward along a clinical path:
* `WAITING → IN_PROGRESS`: Triggered when the staff "Marks Attending" to call the patient to a consultation room.
* `IN_PROGRESS → COMPLETED`: Triggered when the doctor/nurse concludes the clinical consultation.
* Backward transitions are rejected to preserve data flow integrity.

### 4.3 Escalation State
* If a patient's condition worsens in the waiting room, staff can click the **Escalate now** action.
* This updates `escalated` to `true` and saves the name of the operator.
* Triggering escalation displays a high-visibility crimson banner `🚨 ESCALATED — IMMEDIATE ATTENTION REQUIRED` on the dashboard, alerting the team to respond immediately.
