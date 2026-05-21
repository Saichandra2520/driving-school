# Mary Driving School

Desktop application for managing Mary Driving School admissions, students, fees, attendance, expenses, reports, staff, branches, and payment receipts.

The app is built with Electron, React, TypeScript, Tailwind CSS, and Firebase.

## Requirements

- Windows, macOS, or Linux laptop
- Node.js 20 or newer
- npm 10 or newer
- Git
- Firebase project with Authentication and Firestore enabled
- Firebase CLI, only needed when deploying rules/indexes

## Setup

1. Clone the project:

```bash
git clone <repository-url>
cd "Mary Driving School"
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

4. Start the app in development mode:

```bash
npm run dev
```

## Firebase Setup

In Firebase Console:

1. Create or select a Firebase project.
2. Enable Authentication.
3. Enable Email/Password sign-in.
4. Enable Cloud Firestore.
5. Create the first owner user in Authentication.
6. Add a matching document in Firestore:

Collection: `users`

Document ID: Firebase Auth user UID

Example data:

```json
{
  "fullName": "Owner",
  "role": "owner",
  "branchId": null,
  "createdAt": "2026-05-21T00:00:00.000Z"
}
```

Deploy Firestore rules and indexes:

```bash
npm install -g firebase-tools
firebase login
firebase use <project-id>
firebase deploy --only firestore
```

## Common Commands

```bash
npm run dev
npm run typecheck
npm run build
npm run package
npm run dist
```

## Production Notes

- Deploy `firestore.rules` and `firestore.indexes.json` before production use.
- After deploying the latest Students search changes, sign in as owner and run `Settings -> Student Search Index -> Backfill Next Batch` until it says complete.
- Payment and receipt-number actions require internet access.
- Keep regular backups from `Settings -> Data Backup`.

## Troubleshooting

- Blank or login-only app: check `.env` Firebase values.
- Firestore permission error: check user profile document under `users/{uid}`.
- Student list index error: deploy Firestore indexes.
- Search does not find old students: run the Student Search Index backfill from Settings.
