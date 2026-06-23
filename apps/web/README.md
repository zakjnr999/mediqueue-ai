# MediQueue Web Application

This folder contains the MediQueue AI frontend application.

The frontend will be built as one responsive web application with two main interfaces:

* Patient panel
* Hospital staff panel

The patient panel should be designed primarily for mobile browsers, while the staff panel should be optimized for desktop and tablet screens.

---

## Patient Panel

The patient-facing interface should be simple, accessible, and mobile-friendly.

It may include:

* Digital patient check-in
* Basic patient information form
* Predefined symptom selection
* Additional symptom description
* Form validation
* Submission confirmation
* Queue number display
* Queue status tracking

Suggested routes:

* `/patient/check-in`
* `/patient/queue-status`
* `/patient/queue-status/[reference]`

---

## Staff Panel

The staff interface should be optimized for desktop and tablet use.

It may include:

* Staff login
* Live patient queue
* Patient details
* Amazon Bedrock symptom summary
* Amazon Bedrock priority suggestion
* Identified red flags
* Staff confirmation or override
* Patient status updates
* Basic queue statistics

Suggested routes:

* `/staff/login`
* `/staff/dashboard`
* `/staff/patients/[id]`

---

## Suggested Project Structure

The initial frontend structure may look like this:

```text
apps/web/
├── public/
│   ├── images/
│   └── icons/
│
├── src/
│   ├── app/
│   │  
- Additional symptom description
- Form validation
- Submission confirmation
- Queue number display
- Queue status tracking

Suggested routes:

- `/patient/check-in`
- `/patient/queue-status`
- `/patient/queue-status/[reference]`

---

## Staff Panel

The staff interface should be optimized for desktop and tablet use.

It may include:

- Staff login
- ├── patient/
│   │   │   ├── check-in/
│   │   │   │   └── page.tsx
│   │   │   └── queue-status/
│   │   │       ├── page.tsx
│   │   │       └── [reference]/
│   │   │           └── page.tsx
│   │   │
│   │   ├── staff/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   └── patients/
│   │   │       └── [id]/
│   │   │           └── page.tsx
│   │   │
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── patient/
│   │   ├── staff/
│   │   ├── forms/
│   │   ├── layout/
│   │   └── shared/
│   │
│   ├── services/
│   │   ├── patient-service.ts
│   │   ├── queue-service.ts
│   │   └── staff-service.ts
│   │
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   ├── constants/
│   └── config/
│
├── .env.example
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

This structure is only the starting point. New folders should be created only when they have a clear purpose.

---

## Folder Responsibilities

### `public/`

Contains static frontend files such as:

* Images
* Icons
* Logos
* Other public assets

Do not place private files or credentials here because everything inside this folder may be publicly accessible.

---

### `src/app/`

Contains the application pages, layouts, and routes.

Because Next.js uses file-based routing, folders inside `app` will represent routes in the application.

Examples:

```text
src/app/patient/check-in/page.tsx
```

Creates:

```text
/patient/check-in
```

And:

```text
src/app/staff/dashboard/page.tsx
```

Creates:

```text
/staff/dashboard
```

---

### `src/app/patient/`

Contains all patient-facing pages.

Examples include:

* Check-in form
* Symptom selection
* Submission confirmation
* Queue number
* Queue status tracking

The patient experience should be designed mobile-first.

---

### `src/app/staff/`

Contains all hospital staff pages.

Examples include:

* Staff login
* Live queue dashboard
* Patient details
* Priority confirmation or override
* Patient status management

The staff experience should be optimized for desktop and tablet use.

---

### `src/components/`

Contains reusable user-interface components.

#### `components/patient/`

Patient-specific components, such as:

* Patient information form
* Symptom selector
* Queue status card
* Check-in confirmation

#### `components/staff/`

Staff-specific components, such as:

* Queue table
* Patient details panel
* Priority badge
* Priority override controls
* Status update controls

#### `components/forms/`

Reusable form components, such as:

* Text inputs
* Select fields
* Checkboxes
* Form error messages
* Submit buttons

#### `components/layout/`

Shared layout components, such as:

* Header
* Sidebar
* Page container
* Staff dashboard navigation

#### `components/shared/`

Components used across both patient and staff interfaces, such as:

* Loading indicators
* Error messages
* Buttons
* Modal dialogs
* Status badges

---

### `src/services/`

Contains functions used to communicate with the MediQueue backend APIs.

Examples:

* Submit a patient check-in
* Retrieve queue status
* Retrieve the staff queue
* Confirm or override priority
* Update patient status

The files in this folder should call the backend through Amazon API Gateway.

Do not call Amazon Bedrock or DynamoDB directly from the frontend.

---

### `src/hooks/`

Contains reusable React hooks.

Possible examples:

* `use-patient-queue.ts`
* `use-check-in-form.ts`
* `use-staff-queue.ts`
* `use-patient-status.ts`

Hooks should contain reusable frontend behaviour, not AWS credentials or backend business logic.

---

### `src/types/`

Contains shared TypeScript types and interfaces.

Possible examples include:

* Patient
* Patient check-in request
* Queue record
* Queue status
* Priority level
* Bedrock analysis result
* API response
* Staff user

Example:

```ts
export type PriorityLevel = "HIGH" | "MEDIUM" | "LOW";

export type PatientStatus =
  | "WAITING"
  | "IN_PROGRESS"
  | "COMPLETED";
```

---

### `src/utils/`

Contains small reusable frontend helper functions.

Possible examples:

* Date and time formatting
* Queue position formatting
* Form-data transformation
* Error-message formatting

Do not place large business logic or backend operations here.

---

### `src/constants/`

Contains values that remain consistent across the frontend.

Possible examples:

* Predefined symptom list
* Patient status labels
* Priority labels
* Route names
* User-facing messages

---

### `src/config/`

Contains frontend configuration.

Possible examples:

* API base URL
* Environment-variable validation
* Application settings

Sensitive credentials must never be stored here.

---

### `.env.example`

Documents the environment variables required by the frontend without containing real values.

Example:

```env
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_AWS_REGION=us-west-2
```

The real `.env` files must not be committed to GitHub.

---

## Expected Frontend Flow

### Patient Flow

```text
Patient opens check-in page
→ enters basic information
→ selects symptoms
→ adds optional symptom details
→ submits the form
→ receives a queue number
→ views queue status
```

### Staff Flow

```text
Staff logs in
→ views the live patient queue
→ opens a patient record
→ reviews the Bedrock summary and suggested priority
→ confirms or overrides the suggestion
→ updates the patient status
```

---

## Frontend and Backend Separation

The frontend is responsible for:

* Displaying information
* Collecting user input
* Calling backend APIs
* Showing loading, success, and error states
* Presenting queue and priority information

The frontend is not responsible for:

* Calling Amazon Bedrock directly
* Accessing DynamoDB directly
* Generating the official queue number
* Making the final priority decision
* Storing AWS credentials
* Implementing Lambda functions

These responsibilities belong to the backend and AWS infrastructure.

---

## Development Rules

* All frontend and user-interface code belongs in this folder.
* Do not place Lambda or backend logic in this folder.
* Both panels must use the shared backend APIs.
* Do not access DynamoDB directly from the browser.
* Do not invoke Amazon Bedrock directly from the browser.
* Do not commit AWS credentials or real `.env` files.
* Use `.env.example` to document required variables.
* Use TypeScript for application code.
* Keep components small and reusable.
* Patient pages should be mobile-first.
* Staff pages should be responsive for desktop and tablet.
* Display clear loading, success, empty, and error states.
* Use dummy patient information during development.
* New top-level frontend folders should be discussed with the team.
* Keep the core MVP working before adding optional features.

---

## Main Frontend Deliverable

The frontend team should deliver one complete user journey:

```text
Patient check-in
→ symptom submission
→ backend processing
→ queue number display
→ patient appears on staff dashboard
→ staff reviews priority
→ staff updates patient status
```

A complete and reliable flow is more important than many unfinished pages.
