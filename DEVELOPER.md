# Developer Guide

This guide is for a new developer setting up the Driving School Management app on a laptop and working on the codebase.

## Project Stack

- Electron desktop shell
- React 18
- TypeScript
- React Router
- Tailwind CSS
- Firebase Auth
- Cloud Firestore with local persistence
- Zustand stores
- React PDF for payment receipts

## Local Setup

1. Install Node.js 20+ and Git.
2. Clone the repo.
3. Run:

```bash
npm install
```

4. Create `.env` in the project root using the Firebase web app config:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

5. Start development:

```bash
npm run dev
```

## Scripts

- `npm run dev`: start Electron/Vite development app
- `npm run typecheck`: TypeScript check without emitting files
- `npm run lint`: currently same as typecheck
- `npm run build`: typecheck and build Electron output
- `npm run preview`: preview built app
- `npm run package`: build unpacked desktop app
- `npm run dist`: build installer/distribution package

## Code Structure

- `src/App.tsx`: route setup and auth gate
- `src/pages`: screen-level pages
- `src/components`: reusable UI and feature components
- `src/services`: Firebase/data/business services
- `src/store`: Zustand state stores
- `src/types`: shared TypeScript types
- `src/utils`: formatting, dates, seed data, helpers
- `firestore.rules`: Firestore security rules
- `firestore.indexes.json`: Firestore composite indexes
- `electron.vite.config.ts`: Electron/Vite build config

## Firebase Development Notes

The app expects Firebase Auth users to have a profile document in `users/{uid}`.

Owner profile:

```json
{
  "fullName": "Owner",
  "role": "owner",
  "branchId": null
}
```

Staff profile:

```json
{
  "fullName": "Staff Name",
  "role": "staff",
  "branchId": "branch_document_id"
}
```

Deploy rules and indexes after changes:

```bash
firebase deploy --only firestore
```

## Important Data Model Notes

- Students are stored in `students`.
- Fees are stored separately in `fees` and linked by `studentId`.
- Attendance sessions are stored in `sessions`.
- Driving tests are stored in `drivingTests`.
- Branch-level access is enforced by Firestore rules.
- Student status is derived in code from licence/status fields in several views.
- Students now include `searchTokens` for scalable prefix search.

For existing production students, run the owner-only backfill from:

`Settings -> Student Search Index -> Backfill Next Batch`

Repeat until the UI says the backfill is complete.

## Students Screen Performance Design

The Students page uses paged reads instead of loading every student:

- Page size is 50.
- Search is debounced by 300ms.
- Prefix search uses `searchTokens`.
- Enrollment date and course start date sorting are query-backed.
- Balance and days remaining sorting apply to the current loaded page.
- Retry keeps previously loaded rows visible when possible.

When changing this screen, avoid returning to full-list realtime subscriptions. That will not scale to large student counts.

## Working Safely

Before submitting changes:

```bash
npm run typecheck
```

For Firebase query changes:

1. Confirm security rules still allow the intended access.
2. Add required composite indexes to `firestore.indexes.json`.
3. Test owner and staff access separately.
4. Deploy Firestore rules/indexes before production rollout.

For payment or receipt changes:

1. Remember receipt numbers are generated online.
2. Preserve transaction behavior in `feeService`.
3. Verify receipt download and WhatsApp actions from payment history.

## Build and Release

Create a production build:

```bash
npm run build
```

Create an unpacked desktop package:

```bash
npm run package
```

Create installer/distribution artifacts:

```bash
npm run dist
```

Build output is written to `out` and release artifacts to `release`.

## Common Issues

- Missing Firebase env vars: app logs a warning and Firebase auth/firestore may fail.
- Permission denied: check `users/{uid}` profile and branch assignment.
- Missing Firestore index: deploy `firestore.indexes.json`.
- Search missing older students: run search-token backfill.
- Payment fails offline: receipt numbers require online Firebase access.
