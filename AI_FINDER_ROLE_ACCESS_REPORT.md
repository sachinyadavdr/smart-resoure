# AI Resource Finder role access

Implemented 2026-10-31. Scope: AI discovery authorization and its existing UI copy only.

## Root cause and change

`POST /api/ai/resource-match` in `backend/src/app.js:68` used `requireAuth, allowRoles('student')`. The existing middleware in `backend/src/auth.js:10` therefore rejected authenticated Owner and Admin tokens with HTTP 403 before calling Gemini.

The endpoint now uses `requireAuth, allowRoles('student', 'owner', 'admin')`. Source comparison confirms this role list is the only change to the backend application. Authentication, query validation, rate limiting and every other role guard are unchanged.

`frontend/app/components/AIMatcher.tsx` now uses the requested description:

> Discover relevant resources using AI-powered recommendations based on available verified listings.

Its login prompt and forbidden message are role-neutral. The input, request headers, loading state, cards, prices, result navigation, empty state and expired-session handling remain intact.

## Exact source files changed

- `backend/src/app.js`
- `frontend/app/components/AIMatcher.tsx`
- `backend/test/ai-access.test.js`

This report is an additional documentation deliverable. No schema, record, environment file, model setting, photo, booking calculation or unrelated UI was changed. Backup: `.backups/ai-all-roles-20261031/`. Git status inspection confirmed the project folder is not a Git repository, so files were backed up instead.

## Security guarantees verified

| Check | Result |
| --- | --- |
| Student, Owner, Admin AI discovery | HTTP 200; identical matching resource IDs |
| Missing or invalid token | HTTP 401 |
| Expired token for each role | HTTP 401 |
| Unsupported signed role | HTTP 403 |
| Owner/Admin student booking creation | HTTP 403; booking count unchanged |
| Student resource creation/editing, owner dashboard, admin audit/dashboard | HTTP 403 |
| Owner admin-audit access | HTTP 403 |
| Admin existing admin-audit/dashboard access | HTTP 200 |
| Owner editing another owner's resource | HTTP 403; resource title unchanged |
| Reviewed demo exclusion | Never recommended for any of the three roles; original row retained |
| Unavailable/maintenance resources | Never recommended |
| Existing extra-eligibility filter | Preserved for all roles; restricted resource not recommended |
| Student booking an extra-eligibility resource | HTTP 403 |
| Invalid AI query | HTTP 400 for every role |
| Sensitive fields | No email, password/hash, token or internal image path in tested recommendations |
| Gemini outage | Existing fallback returned valid recommendations for all roles; provider fetch was intercepted before network access |

The existing recommendation eligibility filter remains common to all three roles. The change broadens who may discover, not which resources are recommended or who may book them. Discovery never grants resource access.

## Verification actually executed

- Baseline full backend suite: **47 passed**, zero failures.
- Focused AI access suite after change: **6 passed**, zero failures.
- Full backend suite after change: **50 passed**, zero failures.
- All automated API tests used in-memory SQLite and temporary upload directories. No persistent database was used.
- Standard frontend build and elevated retry were blocked by Windows `EPERM` while Next.js tried to unlink an existing generated static-output entry. No locked output was manually removed or edited.
- An isolated frontend build passed compilation, TypeScript and page generation. Its app tree was compared byte-for-byte against all 38 current frontend app source files.
- Editor diagnostics: no errors in the three source files changed.
- Browser verification used the real frontend and real backend application running temporarily against an in-memory database on port 4107. Browser API requests were redirected to that temporary instance. Seeded test Student, Owner and Admin accounts each logged in, submitted `Computer` through the visible Finder and received HTTP 200 with the seeded Computer Laboratory recommendation and deterministic fallback source. No recommendations were fabricated by a browser mock.
- Browser Owner/Admin booking attempts against that isolated API returned HTTP 403.
- Temporary browser routing was removed, previous token storage restored and the temporary API stopped.
- Live directory search and category/availability filters still worked: Computer search returned three listings; Laboratory + Available returned two.
- Desktop/tablet/mobile widths 1440, 768, 375 and 320 px had no horizontal overflow.
- No browser JavaScript exceptions were observed. Console HTTP 401/403 messages corresponded to expired sessions and intentional rejection tests; the unchanged image component also emitted development LCP advice. Temporary backend logs showed normal startup, with no unexpected server exception.

## Remaining limits

- No paid/live Gemini call was made. Fallback behavior and simulated provider failure were tested; the provider integration source and model configuration are unchanged.
- The standard build-output lock remains an environment limitation. The identical-source isolated build passed.
- Browser verification used Chromium, not physical devices or Safari.

Stopped after the AI Finder role-access change.
