# MediQueue Triage Service - Amazon Bedrock Proof of Concept (POC)

This folder contains the backend and Amazon Bedrock triage-support logic.

The primary goal of this Proof of Concept is to validate AWS Bedrock Converse API integration, implement strict input validation, ensure response schema conformity, and respect strict clinical safety boundaries.

## Important Safety Rules

> [!IMPORTANT]
> **NO DIAGNOSIS:** This service MUST NOT diagnose the patient. It must not mention potential disease names, syndromes, or medical conditions.
>
> **DECISION SUPPORT ONLY:** Amazon Bedrock only provides decision support. A trained healthcare worker must review, confirm, or override every suggested priority before taking action.
>
> **FAIL CLOSED:** If validation of the Bedrock response fails (such as invalid format, missing keys, or unexpected keys like `diagnosis`), the response is rejected immediately and no recommendation is preserved.

---

## Structure

```text
services/triage/
├── src/
│   ├── bedrock/
│   │   ├── client.mjs              # Bedrock client instantiation
│   │   ├── prompt.mjs              # System prompt and input formatter
│   │   └── analyse-symptoms.mjs    # Core analysis pipeline
│   ├── validation/
│   │   ├── validate-patient-input.mjs    # Patient input validation
│   │   └── validate-triage-response.mjs  # Response schema validation
│   └── errors/
│       └── triage-error.mjs        # Custom error definition
├── tests/
│   ├── triage-validation.test.mjs  # Offline unit tests
│   └── bedrock-poc.mjs             # Live integration test runner
├── bedrock-test.mjs                # Live test entry point
├── package.json
└── README.md
```

---

## Execution Instructions

First, ensure that the package dependencies are installed:
```bash
npm install
```

### 1. Run Offline Unit Tests
Verify input validation, response parsing, code fence stripping, and error paths offline without calling AWS Bedrock:
```bash
npm run test:triage
```

### 2. Run Live Amazon Bedrock Integration Tests
Ensure `BEDROCK_MODEL_ID` is set and you have valid AWS credentials configured in your shell environment:
```bash
npm run test:bedrock
```

---

## Triage Priority Definitions

- **HIGH**: Clear information suggesting immediate staff attention (e.g., severe difficulty breathing, unconsciousness, severe bleeding, seizures, chest pain with breathing difficulty).
- **MEDIUM**: Concerning symptoms requiring timely review without immediate severe red flags. Unclear or incomplete descriptions default here.
- **LOW**: Mild, stable symptoms suitable for first-come, first-served queueing.