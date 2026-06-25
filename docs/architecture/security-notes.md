# MediQueue AI - Security & Compliance Notes

Security is a primary concern for clinical software. This document outlines the security architecture, PII management, and regulatory compliance parameters for MediQueue AI.

---

## 1. HIPAA Compliance & PII Isolation

To comply with HIPAA (Health Insurance Portability and Accountability Act) and regional health data privacy guidelines, MediQueue AI isolates Protected Health Information (PHI) from the Generative AI processing layer.

### PII Stripping Rule
* **Amazon Bedrock AI** is a decision-support tool. Under no circumstances are patient identity parameters (Full Name, Phone number) transmitted to Bedrock model endpoints.
* During check-in, the API Gateway/Lambda handler parses the payload.
* **DynamoDB Write**: Saves the full payload (including `fullName` and `phoneNumber`) as plain text to the secure database partition.
* **Bedrock Payload**: Only packages `age`, selected `symptoms` tags, and `additionalDetails` text to send to Amazon Bedrock. This prevents model training or caching from capturing personal identities.

---

## 2. Staff Authentication & Access Controls

Access to the Staff Dashboard and clinical overrides is restricted to authorized operators.

### 2.1 Amazon Cognito User Pools
* Hospital staff must log in via a secure endpoint managed by **Amazon Cognito** to access protected resources.
* Cognito issues JSON Web Tokens (JWT) upon successful authentication.
* API Gateway endpoints (`PATCH /patients/{id}/priority`, `PATCH /patients/{id}/status`, `GET /queue`, etc.) check the authorization header to validate user identity.

### 2.2 Access Control
* Authenticated staff users are authorized to view the queue, input overrides, escalate patients, and update patient queue statuses.

---

## 3. Data Encryption

### 3.1 Encryption in Transit
* All API traffic between the web client and Amazon API Gateway is encrypted using TLS 1.2/1.3.
* Direct AWS console logins require HTTPS.

### 3.2 Encryption at Rest
* **Amazon DynamoDB**: Configured with default service-side encryption at rest using AWS-managed keys (KMS).
* **Local Storage / Session Cache**: Patient queue tokens stored in the browser's `localStorage` contain only UUID session references (`patientId`), not PHI attributes.

