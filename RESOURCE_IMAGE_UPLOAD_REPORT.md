# Resource photo uploads

Implemented in the original Next.js + Express + SQLite project on 2026-10-31.

## Behavior

The owner Add/Edit form now has an accessible **Resource photo** field with drag-and-drop and a Choose image button. It accepts JPG/JPEG, PNG and WebP files up to 5 MiB, checks whether the image can be decoded, previews the selection, and supports replacing/removing a selection. Editing displays the saved photo, with replacement, removal and undo-before-save. Saving is blocked while validation or submission is in progress. Existing metadata fields and validation are retained.

The same uploaded photo appears in owner management, owner dashboard portfolio cards, the public directory and the larger details view. Images have descriptive alt text, consistent aspect ratios, cover fitting and rounded corners. Missing photos use the existing illustrations. Failed photo requests fall back to illustrations; even a failed illustration is hidden rather than showing a broken icon.

## Storage and API

- Existing JSON `POST /api/resources` and `PATCH /api/resources/:id` remain supported.
- The same routes also accept multipart data: a `data` field containing the existing resource JSON and an optional `image` file. Photo-only PATCH requests are supported. `removeImage: true` explicitly removes a saved photo. A file and removal cannot be submitted together.
- Image changes require the actual resource owner, including for admin callers. Existing admin metadata oversight is preserved. Authentication/owner checks run before upload handling for ordinary owner requests.
- Server limits multipart requests to one file, 5 MiB, bounded form fields and bounded part counts. Sharp inspects and fully decodes actual content, permits only JPEG/PNG/WebP, rejects corrupt files, SVG and animations, and caps input at 32 megapixels. Files are re-encoded, stripped of embedded metadata and resized inside 2400 × 2400 without enlarging.
- Storage uses UUID filenames in `<UPLOAD_DIR>/resource-images`, defaulting to `backend/data/uploads/resource-images` when launched from the backend workspace. Client names and paths are not used. SQLite stores only a nullable filename reference, never image bytes or base64.
- The new file is written before the database transaction commits. Failed transactions remove the new file and preserve the old reference/file. The old photo is retired only after a successful replacement/removal commit. Metadata-only edits preserve the photo, capacity, eligibility and other omitted PATCH fields.
- Public read-only `GET /api/resource-images/:filename` validates the UUID filename, requires a current resource reference and restricts reads to the resource-photo directory. Responses permit cross-origin display and retain helmet's content-sniffing protection. Private booking-condition images remain separate and authenticated.
- Resource APIs return a nullable API-relative `imageUrl`, without the internal `imagePath`. The frontend resolves it against `NEXT_PUBLIC_API_URL` and uses Next.js Image with `unoptimized`, so custom image hosts/ports work without a permissive remote-image configuration.

## Migration and starting the updated backend

Migration `005_resource_images.sql` adds nullable `resources.image_path`. Existing rows retain NULL, so listings without photos continue using illustrations. Each migration and its migration-history marker now commit in one SQLite transaction. No migration or seed was run against the development database during this task.

**Restart the updated backend to apply the migration to your normal database.** Its existing startup migration runner applies it automatically. Keep the SQLite database and upload directory together when deploying, restarting or backing up; replacing a database or deleting its upload directory cannot preserve photos.

Tests ran with in-memory SQLite and temporary upload directories. The restart regression used a separately created `resourcebridge-photos-*` directory under the OS temporary directory and a dedicated SQLite file. Its child-process script rejects other database locations. The development database's observed size/last-write time remained 286720 bytes / 2026-10-30 23:35:21. Environment files, secrets, persisted user records and bookings were not edited. No generated Next.js output was edited manually.

## Verification actually completed

- **Frontend production build passed**, including TypeScript and all route/page generation, using the existing VS Code build task.
- Editor diagnostics reported no errors in the frontend application or backend source.
- **26 backend tests passed**, comprising all 17 existing tests plus 9 resource-photo tests. Coverage includes JSON compatibility, migration defaults, valid JPEG/PNG/WebP uploads, actual-content validation despite misleading filename/MIME, image URL consistency across APIs, safe serving/traversal rejection, replacement, metadata preservation, forged content, SVG, truncated files, oversized uploads, invalid multipart JSON, conflicting remove/replace, multiple-file rejection, unauthenticated/student/other-owner/admin restrictions, rollback cleanup, explicit removal and restart persistence.
- Restart persistence was checked in two separate backend processes. The second process retrieved the same stored image reference and identical SHA-256 image bytes from the isolated persistent database/upload directory.
- An intentionally induced database error exercised rollback behavior; the corresponding error log was expected and the test passed.
- Browser checks on the production frontend verified creation with a decoded PNG preview, a saved owner card photo, editing the current photo, invalid-type and oversized-file messages, remove/undo, WebP replacement via an actual drop event, and successful image loading across owner dashboard, public directory and resource details. At 390px those checked views had no horizontal overflow. Browser checks also verified fallback on a simulated missing-photo response and saved removal restoring the illustration.
- Port 4000 was occupied by an existing server. It was not interrupted. Browser test API requests were explicitly routed to a separate in-memory server on port 4201; no test listing was created in the development database. A hidden old browser tab could not be clicked, so a fresh shared tab was used. The production preview was restarted after rebuilding to avoid stale generated chunk references. Temporary test servers/routing were removed after verification.

## Files changed or added in this task

| File | Change |
|---|---|
| [frontend/app/owner/resources/page.tsx](./frontend/app/owner/resources/page.tsx) | Multipart Add/Edit, upload state, saved image wiring, validation/save locks |
| [frontend/app/components/ResourcePhotoField.tsx](./frontend/app/components/ResourcePhotoField.tsx) | Accessible drop zone, preview, replace/remove/undo and client validation |
| [frontend/app/components/ResourceImage.tsx](./frontend/app/components/ResourceImage.tsx) | Owner photo URLs, accurate captions/alt text and robust fallbacks |
| [frontend/app/components/Dashboard.tsx](./frontend/app/components/Dashboard.tsx) | Owner portfolio photographs |
| [frontend/app/resources/page.tsx](./frontend/app/resources/page.tsx) | Public card photographs |
| [frontend/app/resources/[id]/page.tsx](./frontend/app/resources/%5Bid%5D/page.tsx) | Large details photograph |
| [frontend/app/lib/api.ts](./frontend/app/lib/api.ts) | Safe API-relative image URL resolution |
| [frontend/app/globals.css](./frontend/app/globals.css) | Consistent image aspect ratios and rounded corners |
| [frontend/app/image-credits/page.tsx](./frontend/app/image-credits/page.tsx) | Accurate owner-photo/fallback disclosure |
| [backend/src/app.js](./backend/src/app.js) | Multipart create/update, owner photo permissions, transactional save/cleanup, API image references |
| [backend/src/resource-images.js](./backend/src/resource-images.js) | Bounded multipart parser, decoding/re-encoding, safe persistent storage and public image reads |
| [backend/src/db/migrations/005_resource_images.sql](./backend/src/db/migrations/005_resource_images.sql) | Nullable resource image reference |
| [backend/src/db/migrate.js](./backend/src/db/migrate.js) | Register migration and atomically record applied migrations |
| [backend/package.json](./backend/package.json) | Explicit Sharp dependency |
| [package-lock.json](./package-lock.json) | Dependency lockfile update |
| [backend/test/resource-images.test.js](./backend/test/resource-images.test.js) | Nine upload/security/persistence regression tests |
| [backend/scripts/check-image-persistence.mjs](./backend/scripts/check-image-persistence.mjs) | Guarded fresh-process persistence verification |
| [backend/scripts/ui-preview.mjs](./backend/scripts/ui-preview.mjs) | Optional preview API port for isolated verification alongside a running backend |
| [IMAGE_CREDITS.md](./IMAGE_CREDITS.md) | Updated owner-upload support notes |
| [RESOURCE_IMAGE_UPLOAD_REPORT.md](./RESOURCE_IMAGE_UPLOAD_REPORT.md) | This implementation and verification report |

Temporary source-transformation scripts were removed. Sharp was already installed; it was declared explicitly with a package-lock-only npm update, without editing installed package files.
