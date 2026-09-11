# Security Rules testing

Firestore and Storage Rules are tested with the Firebase Rules Unit Testing
library against isolated local emulators.

Run the complete rules suite from the repository root:

```powershell
pnpm --dir functions test:rules
```

The full backend-foundation gate, including these rules tests, function tests,
web checks, Flutter analysis, and isolated seed/reset validation, is:

```powershell
pnpm phase3:verify
```

The script starts the Firestore and Storage emulators using
`firebase.test.json`, loads the checked-in rules, runs tests serially, and
shuts the emulators down. It uses the locally pinned Firebase CLI rather than a
global installation and the reserved `demo-feasta-phase3` project ID, so the
test command cannot address the production project.

The Firestore suite covers trusted user bootstrap, immutable account fields,
customer privacy, provider visibility and self-approval denial, verification
ownership, booking/event/request participation, backend-controlled lifecycle
fields, payments, admin logs, notifications, and complaints.

Client user bootstrap is permitted only when a trusted Firebase Auth token
contains a `role` claim of `customer` or `provider`, and the submitted role
matches that claim. Client-created admin profiles are always denied. The normal
mobile registration flow continues to use trusted callable functions, so it
does not depend on a client choosing its role.

The Storage suite covers owner and non-owner uploads, MIME and size limits,
replacement, delete policy, provider ownership resolution, private verification
reads, admin review reads, booking participation, and complaint evidence.
