# MediQueue Web Application

This folder contains the MediQueue AI frontend application.

The web application will have two main interfaces:

## Patient Panel

The patient-facing interface should be mobile-friendly.

It may include:

- Digital patient check-in
- Basic patient information form
- Predefined symptom selection
- Additional symptom description
- Queue number display
- Queue status tracking

Suggested routes:

- `/patient/check-in`
- `/patient/queue-status`

## Staff Panel

The staff interface should be optimized for desktop and tablet use.

It may include:

- Staff login
- Live patient queue
- Patient details
- Amazon Bedrock priority suggestion
- Staff confirmation or override
- Patient status updates
- Basic queue statistics

Suggested routes:

- `/staff/login`
- `/staff/dashboard`
- `/staff/patients/[id]`

## Rules

- All frontend and user-interface code belongs here.
- Do not place Lambda or backend logic in this folder.
- Both panels should use the shared backend APIs.
- Do not commit AWS credentials or real `.env` files.
- Use `.env.example` to document required variables.