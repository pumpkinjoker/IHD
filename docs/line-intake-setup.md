# LINE intake preparation

## Current scope

This branch adds the conversation rules, local simulator, signed webhook, LINE
reply/media client, Supabase persistence and Google My Drive archive adapter.
The live instance uses Supabase for records and private evidence storage.
As of 2026-10-29 the OA webhook is
`https://ihd-gen.vercel.app/api/line/webhook` on Vercel. Intake, summary navigation,
Use webhook and redelivery are enabled; signed readiness checks and LINE Verify
passed. No local computer or tunnel is needed. Local/tunnel instructions below
describe the earlier development setup. Google Drive is not connected.
Existing expense forms and document generation remain unchanged.

Flow: postback `intake:start` → one image → subject → location → review → confirm.
First use asks for an eight-digit employee ID, looks it up in the directory, and
shows the name for confirmation. This is intentionally self-declared association,
not authentication: the user explicitly chose no OTP, email verification or
invitation. `transitionEmployeeIntake` wraps the photo flow, remembers the selected
employee in the supplied session and stamps employee ID/name on saved entries.
Once associated, a photo received while no job is open starts a new dated entry
immediately and prompts for its subject; the Start postback remains available.
Extra photos while a job is open do not replace its evidence. Explicit photo
replacement is still available from review. Active membership is also checked
when a photo starts a job. Unassociated users still select their employee first.
Unknown/inactive IDs cannot be selected; changing employee is allowed between
jobs. The production adapter must persist the association keyed by LINE user ID.
Review supports replacement of the one image, editing text, a real past work date,
and cancellation. Dates default to Asia/Bangkok. Starting again never silently
discards an unfinished draft. Commands are postbacks, not magic text strings.

## Try it before the OA exists

### Supabase database with local photos

Set `LINE_DATABASE_MODE=supabase`, `LINE_MEDIA_MODE=local`, `SUPABASE_URL`, and
server-only `SUPABASE_SERVICE_ROLE_KEY`. Both the actual LINE receiver and the
loopback record/test APIs use the selected store. Media remains on disk and never
uploads to Supabase Storage or Google Drive. Any local media means this setup is
still blocked on Vercel and requires the computer/tunnel to stay running.

For project IHD (`pqyvtdvskovhbsjduskr`), the two migrations create server-only
tables/RPCs and an employee directory. After explicit user approval, the initial
snapshot migrated 9 employees, 2 sessions, 52 events and 7 confirmed entries.
The backup is `.local-data/line/backups/before-supabase-1793008203891.json`.
Every imported field was checked against that backup after normalizing PostgreSQL
date/timestamp representations. The original local database and all photos remain.
New records after switching are written to Supabase, not mirrored into the old
local database. Do not switch back without reconciling newer cloud changes.

The direct service-role connection is used; no custom bridge Edge Function was
deployed. All five tables have RLS enabled and no anonymous/authenticated table
access. The absence of client policies is intentional because only the backend
uses these tables. Never put the server key in browser variables, source code or
logs. Maintain the employee directory in the selected database after migration;
the local JSON bootstrap does not overwrite the Supabase directory.

### Persistent local mode (no Google or Supabase account needed)

Set `LINE_STORAGE_MODE=local` in `.env.local`, run `pnpm dev`, and open
`http://127.0.0.1:3000/line/local-test`. This uses on-disk PGlite PostgreSQL and
real local image files via the same receiver, transactions and conversation rules
as the LINE adapter. Employee selection, unfinished drafts, images and confirmed
entries survive refresh and server restart. Only the latest bot prompt is
restored; the full displayed chat transcript is not stored.

The page uses a dedicated browser-test identity, separate from real LINE users.
Its transport never calls LINE, Drive or email. Its API is restricted to
same-origin loopback requests in development/local mode; images must belong to
that test identity's draft or saved entries. The page and API are disabled in
production, and local storage mode itself is disabled on Vercel.

The default data root is `.local-data/line` (ignored by Git):

- `database/`: persistent PostgreSQL data and migration version.
- `media/YYYY/YYYY-MM/employeeId_name/หลักฐาน/`: original validated images.
- `media/.index/`: internal image-reference manifests for idempotent retrieval.

References are opaque `local:<sha256>` identifiers, never browser-supplied paths.
Image filenames use the work date as `yyyymmdd`, for example `20261026.jpg`.
Each employee can save one work entry and one image per date; filenames have no
numeric suffix. Confirmation updates both the folder and filename when the work
date changes. The original image extension is preserved.
Confirmation moves backdated evidence into its chosen work month. Cancelled and
replaced images are retained; cleanup is not enabled. Directory/file permissions
are private to the local user. Use one server process for the database; the dev
runtime shares one connection across hot reloads. Stop the server before copying
the complete data root for backup. `IHD_LOCAL_DATA_DIR` can override its location.

The signed LINE webhook can run against local storage with
`LINE_INTAKE_ENABLED=true` and the two LINE credentials. No Google/Supabase values
are required in this mode. Calling it from an actual OA still requires a public
HTTPS endpoint/tunnel; running `pnpm dev` alone does not start one. The persistent browser-test
page can be used immediately without opening anything to the internet.

### Testing with the actual OA through a temporary tunnel

For this chat's OA test, a verified official cloudflared binary was downloaded
to `/private/tmp/ihd-line-tunnel/cloudflared`. Run three processes while testing:

1. `pnpm dev --hostname 127.0.0.1` (IHD on port 3000).
2. `node --env-file=.env.local scripts/line-webhook-relay.mjs` (relay on port 8787).
3. `/private/tmp/ihd-line-tunnel/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8787 --protocol http2`.

Only exact `POST /api/line/webhook` requests with a valid LINE signature are
forwarded. Other routes return 404, unsigned requests return 401, and bodies are
limited to 1 MB. Do not tunnel the full development app on port 3000 directly.
The relay makes no changes to a webhook body and never logs credentials or
employee message contents.

The active temporary URL is recorded in the ignored local file
`.local-data/line/oa-local-tunnel.json`. The previous OA endpoint was saved once in
`.local-data/line/oa-webhook-before-tunnel.json`. Update the OA endpoint only after
LINE's test API succeeds for the new URL; passing Verify does not enable the
Use webhook toggle. That toggle is in LINE Developers → Messaging API → Webhook
settings. Enable redelivery as well, and disable conflicting OA auto-replies.

The tunnel is accountless and temporary; restarting it changes its URL. Keep the
computer awake and all three processes running. Stop the tunnel after testing
and restore the previous endpoint from the saved settings when appropriate.
No production deployment, scheduled task or permanent public server is created.

### In-memory demo

1. Run `pnpm dev`.
2. Visit `http://localhost:3000/line/simulator`.
3. Use a sample photo and fictitious job information.

The simulator uses the same pure `transitionIntake` rules intended for the real
adapter. Images are browser object URLs. The simulator receives only employee IDs,
names and active flags from the existing master data, without email addresses.
It does not load existing work records or credentials. Refreshing clears the
selection and all trial entries. The route always returns 404 in
a production build and is intentionally not linked from the main document menu.

Unit tests: `pnpm test`. With a development server running, run
`pnpm exec playwright test tests/e2e/line-intake-flow.spec.ts` to exercise the whole
local flow. The normal production E2E setup skips the simulator flow after checking
that it is unavailable. Existing document E2E tests still run in production mode.

## OA settings after creation

Copy `.env.example` to `.env.local` and populate only the server-side LINE values:

- `LINE_CHANNEL_SECRET`: signature verification secret.
- `LINE_CHANNEL_ACCESS_TOKEN`: used by the reply/media client.
- `LINE_BOT_USER_ID`: optional destination check; use the bot's U-prefixed ID,
  not its @basicId or channel ID.

Never put these in a `NEXT_PUBLIC_*` variable or commit actual credentials.

Webhook URL after deployment: `https://<IHD-domain>/api/line/webhook`.
The signed, empty-events request from LINE Developers Verify is supported once the
secret is configured. Passing Verify is not evidence that real intake is enabled.

An API-created rich menu can use postback `intake:start`; an OA Manager text action
`เพิ่มข้อมูลหน้างาน` is also accepted while idle. The state machine uses `intake:cancel`, `intake:confirm`, and
`intake:edit:photo|subject|location|date` for subsequent quick reply buttons.
`employee:confirm` confirms the selected name; `employee:change` asks for a new ID.
Group and room events are excluded from the conversation action mapper.

## Enable the implemented production receiver

The receiver is wired but remains **disabled** by default. To activate privately:

1. Set `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` for the selected
   project. Run `supabase/migrations/202610260001_line_intake.sql` once in its SQL
   editor. The migration enables RLS, denies anonymous/authenticated access and
   grants the server role access to the transactional functions/tables.
2. Set Google OAuth client ID, client secret, offline refresh token and a dedicated
   private My Drive root folder ID using `.env.example`. No OAuth consent/callback
   UI is implemented yet: the team account must authorize the application's own
   offline credentials. A connected Drive plugin does not supply these tokens.
   Check OAuth app publishing status to avoid testing-mode refresh-token expiry.
3. Set `LINE_INTAKE_ENABLED=true` only after the credentials and migration are
   ready. Missing values keep the endpoint disabled. Deploy to HTTPS, Verify the
   webhook, then enable Use webhook and redelivery, disabling conflicting automatic
   replies. Test with one account before staff rollout.

The initial live directory is the existing validated IHD master-data JSON. No OTP
is required. Follow events begin selection; linked employees can send photos
directly. Names/emails are never accepted from the incoming client as identity.
Quick reply/Flex buttons carry the latest event context so stale confirmation
buttons cannot save a different draft. The long user-selected confirmation label
uses a Flex button to respect LINE's label limits.

Actual PostgreSQL functions are tested with PGlite; HTTP services use mocked test
responses. No test sends real employee data or credentials externally. Confirm
database records, private Drive files and reply status in an account-level test.

Implemented behavior and remaining integration requirements:

1. LINE user ID → employee ID association using the employee-ID-only flow above.
   The selection is persisted on name confirmation; no OTP or invitation is required.
   Use server-side directory lookup in production; never trust a client-supplied
   employee name or email. Sheets is an admin-only directory; sync validated IDs
   and email addresses into the central database. Recheck active membership at
   job start and confirmation; keep historical entries under their original ID.
2. Durable event records, unique `webhookEventId`, per-user ordering/locking and
   session persistence. Commit acceptance before HTTP 200. Store event timestamps
   to detect stale/out-of-order input. Confirmation must atomically create one
   work entry, clear its draft and record the processed event. Bind buttons to a
   draft/revision so a stale confirmation cannot confirm a different draft.
3. Immediate media download using the LINE message ID; validate actual file type
   and size, retry failures, and persist media before reporting success. The pure
   conversation engine's `imageId` is a reference, **not** a downloaded image.
4. Google OAuth for the team's My Drive, secure refresh-token storage and
   reconnection handling. Upload to
   `IHD-เบิกค่าใช้จ่าย/YYYY/YYYY-MM/employeeId_name/หลักฐาน/yyyymmdd.jpg` (one work entry per employee/date, without a suffix).
   Persist folder/file IDs; deduplicate uploads by entry/image identity rather
   than filename. A backdated entry must be filed under its work month. Store one
   active evidence image per entry. Cancelled/replaced files remain archived;
   cleanup is not implemented or enabled.
5. LINE reply transport using `toLineMessage`; handle reply-token expiry, duplicate
   delivery and an outbox without replaying state changes. Download/queue media
   promptly instead of waiting for monthly export.
6. Feed confirmed records into IHD's document data. Do not assign per-diem amounts
   based solely on a photo; preserve the existing reviewed expense workflow until
   business rules are agreed.
7. Background PDF generation from the existing template, private Drive upload and
   separate email authorization. Send each employee only their own PDF. Snapshot
   employee details/amounts and store PDF version plus delivery status. Monthly
   close and retry jobs need unique employee/period/version delivery keys and
   reconciliation for ambiguous email-provider timeouts.

The monthly LINE-link schedule is now configured as described below. Direct email
from the requested inhouse.mkt@toagroup.com account still requires mail authorization.

## Operational limits before rollout

### Viewing confirmed entries

In LINE, a linked employee can type `ดูรายการ` / `รายการของฉัน` / `ดูข้อมูล`
to list this month's confirmed entries, or `ดูรายการ 2026-09` for another month.
Results are scoped to both the current LINE user and associated employee, with
five records per page. Text commands are recognized while idle or at review,
so ordinary subject/location input remains literal. Browsing from review keeps
the draft and offers a return button. Confirmed replies also include a View
records button. Unconfirmed drafts never appear as saved records.

Review cards are compact: the exact requested confirmation label is preserved
as one small primary button, with Edit/Cancel side by side. Edit opens the
individual field choices separately. Existing messages in LINE are unchanged;
new review prompts use the compact layout.

For viewing photos on this computer, open `http://127.0.0.1:3000/line/records`.
It lists up to 500 latest confirmed records across local test identities and
actual LINE users, with month/employee filters and photos. The page and its image
API are restricted to development/local/loopback access and are not reachable
through the public webhook relay. Photos are not made publicly accessible for
LINE history queries.

This initial receiver processes inline (120-second route limit), rather than
running an autonomous job queue. Transient failures return 503 for LINE redelivery,
which is best effort. A failed earlier event intentionally blocks newer events
until recovery. Monitor `line_events.status='processing'`; there is no background
retry scheduler yet. Old timestamps are ignored rather than corrupting a newer
conversation; inspect those records when diagnosing missing input.

Entry save, session update and reply recording are atomic. Pending replies can be
retried without applying a state change twice. Expired/already-used reply tokens
are marked rejected and saved data stays intact; there is no push fallback that
could duplicate a success notice. Media downloads validate size/type/signature.
Drive folder creation uses a global lease and upload retries search by a hashed
message key. No public file permissions are created. Backdated confirmation moves
evidence to the chosen work month before the entry is saved.

Production deployment and server credentials were verified on 2026-10-29.
The signed webhook and LINE verification checks do not send employee messages;
an account-level conversation can be tested by typing `เมนู` in the OA.
Add operational retry/recovery and
connect the saved entries to the existing expense document workflow before staff
rollout. Google Sheets sync, monthly PDF jobs and email delivery are not built in
this step.

## References

- https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/

### Edit LINE records in the original expense form

Open `/documents/expense-request/new`, select the team, requester and month, then
click **เปิดรายการที่บันทึกไว้**. The original form loads the selected employee's
Supabase entries and images from the configured evidence archive. Edit the fields and click
**บันทึกการแก้ไข**, or **ยืนยันและดูตัวอย่าง** to save and open the existing document
preview. Use **เปลี่ยนคนหรือเดือน** to open a different selection.

Edits update the original LINE entry, including expense fields stored in its JSON
data. Images use the configured archive, one per employee/date, named `yyyymmdd` with the
correct extension. A failed database update restores the previous image. Saving
several entries reports any partial progress. Adding/removing stored entries is
not part of this edit flow. Manual document entry remains available separately.

`/api/expense-records` also works on a deployment configured with Supabase for
both database and media. It uses the agreed employee-ID selection, without OTP
or identity verification; members select their employee record in the existing
form. Writes require the same HTTPS origin. Admin and simulator APIs remain
local-only. The server key is never returned to the browser.

### Supabase image test environment

The current test setup uses `LINE_DATABASE_MODE=supabase` and
`LINE_MEDIA_MODE=supabase` in `.env.local`. It reuses the IHD database and stores
images in the **private** `ihd-evidence-test` bucket. Final object paths are
`YYYY/YYYY-MM/employeeId/evidence/yyyymmdd.ext`; the employee's Thai name stays in
the database. The registry `line_evidence_files` keeps image references stable
when dates or images are edited. Neither local photos nor Google Drive is needed
for new entries in this mode. Deployments require `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `LINE_DATABASE_MODE=supabase`,
`LINE_MEDIA_MODE=supabase`, `LINE_INTAKE_ENABLED=true`, `LINE_CHANNEL_SECRET`,
`LINE_CHANNEL_ACCESS_TOKEN`, and optionally `LINE_BOT_USER_ID` as server-side
environment variables. Git pushes trigger the connected Vercel deployment.
The OA's temporary tunnel stays in use until the deployed webhook is verified.

`scripts/setup-supabase-test-storage.mjs` provisions the private bucket with an
8 MB limit and JPG/PNG/WebP types. It requires the existing server credentials.

The deployed `cleanup-test-evidence` Edge Function has JWT verification enabled
and requires service-role access through the Data API before it can delete any
objects. Cron job `ihd-test-evidence-retention` calls it at 00:00 Bangkok daily;
the cutoff changes on the first day of each calendar month. January images
expire on March 1. Only the current month and previous month are retained,
based on the **work date**, not upload date. Daily runs catch missed executions
and backdated uploads. The existing server credential for Cron is stored in
Vault as `ihd_test_evidence_service_key`; update it if the credential rotates.

Cleanup removes bytes through the Storage API, then transactionally deletes the
corresponding work entries, image registry rows and expired chat logs. Expired
work drafts are reset. Employee directory and LINE registration remain so users
can submit again. Storage deletion must succeed before associated data is removed.
No Google Drive or other buckets are affected.

Regular tests are offline. Opt-in cloud verification:
`IHD_STORAGE_SMOKE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/supabase-storage-live.test.ts`.
It creates temporary isolated fixtures, verifies upload/read/edit/LINE commit,
dry-runs cleanup, and removes its own fixtures without sending LINE messages.

### Monthly LINE summary delivery

`monthly-report-worker` runs through Supabase Cron job
`ihd-monthly-personal-reports`: day 1, 08:00 Bangkok, with five-minute retries
until 09:55 for pending recipients. It selects the previous calendar month.
People with no work are skipped. A recipient needs exactly one real LINE user
association; absent/ambiguous recipients are recorded as blocked. Browser test
identities are excluded. Association and active status are rechecked before push.

Reports snapshot each employee's directory data, entries and evidence copies in
the private `ihd-monthly-reports` bucket. Unsaved amounts use the agreed 300 baht
per day; amounts saved through the original form take precedence. The signed
summary URL is placed in the fragment of `/line/monthly`, so Vercel does not need
new server credentials to serve this read-only page. It validates the Storage
origin, bucket, signed assets, employee and month before rendering.

The page reuses the existing expense and evidence components and requester
snapshot. Save as PDF uses the browser print dialog. Long monthly tables flow
onto additional print pages without dropping rows or signature fields.

`line_monthly_reports` is a server-only outbox with a unique month/employee key,
leased jobs, frozen message text and a persisted LINE retry UUID. A successful
send is never repeated. Ambiguous retries stop before LINE's 24-hour retry-key
window; such rows need reconciliation, not a fresh automatic send. Last errors
store generic codes without provider response bodies or credentials.

The LINE token is held in Vault as `ihd_monthly_line_token`; the existing
`ihd_test_evidence_service_key` authenticates Cron. Both functions keep gateway
JWT verification and service-role checks. No public table grants are added.
Report JSON, image copies and outbox rows are deleted with the original work
month by the existing cleanup task. January summaries expire on March 1.

The requested mail sender is inhouse.mkt@toagroup.com, with the subject
“สรุปยอดเบิกค่าใช้จ่ายเดือน…”. Sending email from that account is not enabled:
no SMTP, OAuth or mail provider has been authorized. The user chose the LINE
web-summary fallback. No real employee messages are sent by QA; the cloud smoke
test intercepts LINE transport and removes all of its temporary objects and rows.

### LINE summary button

Set `LINE_SUMMARY_ENABLED=true` on the webhook server using the Supabase
store. The former `LINE_TEST_SUMMARY_ENABLED` flag remains supported when the new
flag is absent. Type **เมนู** or **ดูสรุปตาราง** in the OA to see the summary button.
The Flex table shows the bound employee's confirmed entries in the current
Bangkok month: day, subject/location, daily expenses and the complete month's
expense total, including accommodation and other cost fields. Saved web amounts override the 300/day default. Five rows are
shown per page; current drafts and the real monthly delivery remain unchanged.
An explicit month is accepted as `ดูสรุปตาราง YYYY-MM`. Buttons use the same
per-conversation context checks as the existing intake menus. Enable the flag in
production to offer the summary and document-link navigation. The sample Flex payload was validated with LINE's validation API,
without sending any test messages to real employees.

The test table also offers **ขอลิงก์สรุป** (or type that command directly).
This creates a private web preview for the bound employee and selected month,
with signed evidence URLs and a lifetime of at most 24 hours. The page opens
the same document preview layout as the web form and supports Save as PDF. Preview JSON is tracked separately
in `line_summary_previews`, so it cannot replace or suppress the final monthly
outbox. The existing cleanup deletes expired preview objects and registry rows
at the start of the third month. No public table access is granted.

New preview and monthly links use `/s#<22-character random token>`. Only its
SHA-256 hash is stored in the private `line_report_links` table. The
`resolve-report-link` function authenticates this scoped bearer token and returns
a report-only signed URL valid for at most 60 seconds; the token keeps the original
report expiry. Cleanup removes expired tokens daily. Existing long links still work.
When editing a draft's work date in LINE, enter only the day (`7`, `27`); the month
and year remain those of the draft. Invalid days and future dates are rejected.

The report toolbar includes **แก้ไขเอกสาร**, which opens the existing form with
live database records for that link's employee and month. The API validates the
token hash and expiry on reads and writes; a valid previous-month report may be
edited without enabling arbitrary month selection. The token travels in a URL
fragment, then a request header/body. Cost edits save to the existing work rows.
The monthly message reports the complete expense total and omits the link-expiry
sentence; expiry and retention rules still apply.
