# ResourceBridge AI — Hackathon Project Document

## 1. Project title and use case

**ResourceBridge AI** helps educational communities discover, request, share, and responsibly return equipment, spaces, and learning resources.

Selected use case: a student needs a projector, lab device, room, or other shared resource; an owner controls access; an administrator reviews safety and accountability records.

## 2. Problem and target users

Shared campus resources are often difficult to discover, governed by informal messages, and tracked inconsistently. Students need clear availability and eligibility information. Owners need controlled approvals, return evidence, and incident visibility. Administrators need reviewable audit history without relying on automatic punishment.

Target users:

- Students requesting eligible resources.
- Resource owners publishing resources and reviewing requests.
- Administrators overseeing resources, incidents, bookings, and audit records.

## 3. Implemented solution

ResourceBridge provides a verified resource catalog, role-based authentication, booking requests, owner decisions, fair waitlists, lifecycle check-in/check-out, condition reports, incidents, notifications, and audit history. An optional backend-only Gemini integration interprets natural-language needs but can only recommend records already returned from SQLite. If Gemini is unavailable, deterministic matching provides a predictable fallback.

Restricted access remains a human decision. Waitlist promotion returns a request to owner review rather than granting automatic approval.

## 4. Complete workflow

1. A student registers or logs in.
2. The student browses resources or describes a need to the resource finder.
3. The system returns verified available resources with eligibility and access rules.
4. The student submits start/end times and purpose.
5. The backend validates eligibility, duplicate requests, booking limits, and scheduling conflicts.
6. The owner approves or rejects with a recorded reason.
7. On approval, the student checks in during the permitted window and records initial condition.
8. The student can submit a before/after condition report, optional validated image, or incident.
9. The student checks out and records final condition and return notes.
10. Notifications and audit events provide persistent evidence for the student, owner, and authorized administrator.

## 5. Key features and technology

- Next.js App Router, React, and Tailwind CSS.
- Express.js API with Zod validation.
- Node 25 built-in `node:sqlite`, SQL migrations, foreign keys, WAL mode, and transactions.
- bcrypt password hashing and JWT authorization.
- Multer memory uploads with MIME, size, filename, and role checks.
- Optional Google Gemini API access from the backend only.
- Automated Node integration tests with Supertest.

## 6. Architecture and AI integration

The frontend uses `NEXT_PUBLIC_API_URL` to call the Express backend. The backend owns authentication, authorization, business rules, database transactions, uploads, notification creation, audit records, and Gemini calls. SQLite stores users, resources, eligibility requirements, booking requests, check-ins/check-outs, condition reports, incidents, notifications, waitlists, and audit logs.

The AI matcher receives a student query and a filtered catalog of actual available SQLite records. It is instructed to return only catalog IDs. The backend intersects the response with the verified catalog before returning recommendations. Missing credentials, model errors, network errors, or invalid AI output use deterministic matching. AI never approves a booking or bypasses eligibility.

## 7. Security, privacy, fairness, and oversight

- Environment files, databases, WAL files, build output, coverage, and private data directories are ignored.
- Passwords are hashed; API keys are backend-only.
- Protected endpoints enforce authenticated role checks and ownership checks.
- SQL uses parameterized statements.
- Booking inputs, purposes, reasons, incidents, and reports are validated server-side.
- Overlapping confirmed bookings and duplicate active requests are blocked.
- Booking limits and transparent waitlists reduce monopolization.
- Waitlist promotion rechecks eligibility, conflicts, and limits.
- Condition images are private and available only to the student, resource owner, or admin for the related record.
- Incident and access decisions remain reviewable by owners/admins; penalties are not assigned automatically.

## 8. Testing results

Verified locally:

- Database migrations: PASS.
- Backend test suite: PASS, 13 of 13 tests.
- Frontend production build: PASS, 15 routes generated.
- `npm audit --audit-level=moderate`: PASS, zero vulnerabilities.
- Browser smoke: resource discovery, booking submission, owner approval with a reason, notifications, and AI fallback were exercised.

The complete backend lifecycle journey and unauthorized actions are covered by integration tests. Browser testing also completed an active-window journey through check-in, condition report, incident, check-out, audit, notifications, and role isolation; lifecycle transitions were verified through authenticated browser-originated API calls when automation clicks were flaky.

## 9. Known limitations and future scope

- Gemini live availability depends on external quota and model availability; fallback is implemented.
- Notifications are evaluated when relevant endpoints are requested; there is no background scheduler or email/SMS delivery.
- The condition-image API is protected, but a dedicated image gallery UI is future work.
- SQLite requires persistent disk or migration to a managed database for production scale.
- Team details, product URL, repository URL, and final hosted demo credentials are intentionally placeholders.

## 10. Team contribution placeholders

Replace these before submission; do not invent names:

- **[Team member 1 name]** — [frontend / UX / accessibility contribution]
- **[Team member 2 name]** — [backend / database / security contribution]
- **[Team member 3 name]** — [testing / deployment / documentation contribution]
- **[Additional member]** — [contribution]

## 11. AI, libraries, and pre-existing component disclosure

- AI assistance: Codex was used to inspect, implement, test, and document code changes. Gemini is an optional runtime feature for resource discovery only.
- Existing libraries: Next.js, React, Tailwind CSS, Express, Node `node:sqlite`, bcryptjs, jsonwebtoken, Zod, Multer, Helmet, CORS, Supertest, and related npm dependencies.
- Pre-existing components: the Phase 1–4 ResourceBridge codebase, routes, migrations, authentication, dashboards, lifecycle APIs, and tests were preserved and extended.
- No paid services were added. No external service was deployed or connected automatically.

## 12. Demo instructions and credential placeholders

Local setup is documented in [README.md](./README.md). Before the demo:

1. Copy [backend/.env.example](./backend/.env.example) to `backend/.env`.
2. Set a strong local `JWT_SECRET`.
3. Manually add a newly rotated Gemini key only if live AI recommendations are desired.
4. Run migrations and fictional seed data.
5. Use fictional accounts created for the demo.

Demo credential placeholders:

- Student: `[student email]` / `[student password]`
- Owner: `[owner email]` / `[owner password]`
- Admin: `[admin email]` / `[admin password]`

Do not publish real passwords, API keys, personal information, or unverified links in the submission.
