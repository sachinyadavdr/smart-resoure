# ResourceBridge AI

ResourceBridge AI is a hackathon-ready resource-sharing platform for students, resource owners, and administrators. It combines a verified SQLite catalog, role-based booking workflows, lifecycle accountability, fair waitlists, incident review, audit history, persistent notifications, and optional backend-only Gemini resource discovery.

## Architecture

- `frontend/`: Next.js App Router, React, Tailwind CSS, responsive client pages.
- `backend/`: Express API, JWT/bcrypt authentication, Zod validation, Node 25 `node:sqlite`, migrations, fictional seed data, uploads, and integration tests.
- `backend/src/db/`: schema, migration runner, migrations, and seed script.
- SQLite uses a persistent file and WAL mode. Use a persistent disk or managed database for production; do not place the SQLite file on ephemeral serverless storage.

## Implemented features

- Student, owner, and admin authentication with role isolation.
- Public resource discovery with category, location, availability, access rules, and eligibility.
- Backend-only Gemini matching over verified SQLite records, with deterministic fallback when Gemini is unavailable.
- Booking requests, duplicate prevention, eligibility checks, overlap checks, booking limits, cancellations, and transparent waitlists.
- Owner approval/rejection with reasons and fair waitlist promotion back to human review.
- Check-in, check-out, before/after condition reports, optional validated images, and authorized image retrieval.
- Incident reporting and owner/admin review without automatic penalties.
- Persistent deduplicated notifications and role-scoped audit history.
- Responsive pages for home, auth, dashboards, resources, bookings, incidents, notifications, audit, and owner/admin operations.

## Local setup

Requires Node.js 22.5+; Node 25 is recommended for the built-in `node:sqlite` API. `better-sqlite3` is not used.

```powershell
npm install
Copy-Item backend/.env.example backend/.env
npm run db:migrate
npm run db:seed
npm run dev
```

Frontend: `http://localhost:3000`  
API: `http://localhost:4000`

Add a newly rotated Gemini key manually to `backend/.env` if AI recommendations are required. Never place it in `.env.example`, frontend code, source control, or chat. Without a key, deterministic matching remains available.

## Environment variables

Backend variables are documented in [backend/.env.example](./backend/.env.example): `PORT`, `JWT_SECRET`, `DATABASE_FILE`, `CLIENT_ORIGIN`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `UPLOAD_DIR`. Frontend uses [frontend/.env.example](./frontend/.env.example) for `NEXT_PUBLIC_API_URL`.

Use a long random `JWT_SECRET` in any shared environment. Keep the SQLite database and upload directory on persistent private storage. Configure `CLIENT_ORIGIN` to the exact frontend origin in deployment.

## API and demo workflow

1. Register a fictional student account or use a local seed account placeholder supplied by the demo operator.
2. Browse `/resources`, use the optional AI finder, and open a verified resource detail page.
3. Submit a future booking request with a purpose.
4. Log in as the fictional owner, review `/owner/requests`, and approve or reject with a reason.
5. As the student, use `/bookings` during the approved window to check in, submit an optional condition report or incident, and check out.
6. Review `/notifications` and `/audit` for persistent lifecycle evidence.

The API includes health checking at `GET /api/health`. Lifecycle endpoints include booking check-in/check-out, condition reports, authorized condition-image retrieval, incidents, notifications, audit history, and student-only `POST /api/ai/resource-match`.

## Deployment preparation

No deployment or external service connection has been performed.

Recommended split deployment:

1. Deploy `backend/` to a Node-compatible service with a persistent disk, or move the database to a managed production database before using ephemeral infrastructure.
2. Set backend environment variables, including a production JWT secret and exact frontend CORS origin.
3. Run `npm run db:migrate` against the persistent production database. Run seed only for a demonstration environment.
4. Deploy `frontend/` to a Next.js-compatible host and set `NEXT_PUBLIC_API_URL` to the backend API URL.
5. Confirm `GET /api/health`, authentication, uploads, CORS, and persistent data before sharing a product link.

Free tiers may sleep services, limit persistent disk, restrict file storage, or provide temporary filesystems. Vercel-style serverless storage must not be assumed to persist SQLite data. A production submission still needs a verified working product URL, accessible source repository, and hosting-specific environment configuration.

## Verification

Run from the repository root:

```powershell
npm run db:migrate
npm test
npm run build --workspace frontend
npm audit --audit-level=moderate
```

Current local evidence: migrations pass, all 13 backend tests pass, the Next.js production build passes with 15 routes, and `npm audit` reports zero vulnerabilities. Tests cover authentication, authorization, booking conflicts, lifecycle actions, waitlist promotion, AI fallback, image access, notification deduplication, incidents, and audit history.

Browser testing verified registration/login, resource discovery, conflict-to-waitlist behavior, cancellation, a non-conflicting booking, owner approval with a reason, check-in, condition report, incident submission, check-out, audit history, notifications, owner incident visibility, admin operations, and student-to-owner authorization isolation. Some UI click handlers were flaky in this automation environment, so lifecycle transitions were also verified through authenticated browser-originated API calls and rendered results. Live Gemini responses depend on external availability; deterministic fallback is the required resilience path.

## Security and privacy

`.gitignore` excludes environment files, databases, WAL files, build output, coverage, and `backend/data/`. This workspace currently has no Git metadata, so initialize Git and run a secret scan before publication. The previously exposed Gemini key must be revoked by the developer and replaced manually in `backend/.env`; no rotation has been performed by this project.

## Submission checklist

- [ ] Revoke the previously exposed Gemini key and add a newly generated key manually to `backend/.env`.
- [ ] Initialize Git, verify ignored files, scan history and working files for secrets.
- [ ] Add the real hackathon team names and contributions to [PROJECT_DOCUMENT.md](./PROJECT_DOCUMENT.md).
- [ ] Add a verified working product URL and accessible repository URL.
- [ ] Run the full browser workflow with a live booking window.
- [ ] Review deployment disk, upload, CORS, and environment settings.
- [ ] Do not push, deploy, or submit until the developer approves.
