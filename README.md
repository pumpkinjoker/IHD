# IHD Document Generator

Internal browser-only document generator for the In House Production team.

Version 1 supports the เอกสารเบิกเงิน / Expense Request data-entry flow:

- document selection
- requester selection from `master-data.json`
- dynamic work and expense items
- one browser-processed evidence image per work item
- automatic totals and Thai Baht text
- temporary structured preview
- back-to-edit with draft data retained

The official A4 print layout will be implemented in a later milestone.

## Scope

This project intentionally does not use a database, authentication, backend API, permanent document storage, online approval workflow, email sending, or server-side PDF generation.

## Stack

- Next.js App Router
- TypeScript strict mode
- React
- Tailwind CSS
- shadcn/ui configuration
- React Hook Form
- Zod
- Browser `sessionStorage`
- Native browser print dialog
- Vitest
- Playwright

## Reference Assets

Large company reference files are kept local-only in `docs/reference/` and are
ignored by Git. Do not commit supplied reference images, PDFs, or workbook
exports.

## Setup

Use the pinned package manager version from `package.json`.

```bash
pnpm install
pnpm dev
```

## Validation

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## Deployment

The intended deployment target is Vercel. Build locally before deploying:

```bash
pnpm build
```

## LINE intake preparation

A development-only chat simulator is available at `/line/simulator` when running
`pnpm dev`. It exercises one photo → subject → location → review → confirmation,
including editing and cancellation, without writing real employee records.
First use looks up an employee ID from the current IHD master data and asks the
user to confirm the name. No OTP or email verification is required. The selected
employee is remembered until refresh and attached to each trial entry.
After linking, send a photo directly to start the next job without pressing Start.

The signed webhook at `/api/line/webhook` now has a configurable Supabase-backed
receiver, persistent employee association, LINE replies and a private Google Drive
archive. It is disabled by default until credentials and the SQL migration are
configured. This test instance now uses Supabase project IHD for its database and
stores photos in the private `ihd-evidence-test` Supabase bucket; the OA reaches this computer through a temporary tunnel. Google Sheets directory sync and email delivery are not implemented yet. Monthly
LINE summaries are scheduled for the first day at 08:00 Bangkok; see below.
See [LINE setup and remaining integration work](docs/line-intake-setup.md).

The active test setup uses `LINE_DATABASE_MODE=supabase` and
`LINE_MEDIA_MODE=supabase`. At the start of the third calendar month, the
Supabase cleanup job deletes expired photos, work entries and chat data. For
example, January records are removed on March 1 at 00:00 Bangkok. Employee
directory and LINE registration remain. Credentials are server environment
variables, never committed to Git.

### Local database and files

The active test setup can use Supabase for records and local files for photos:
`LINE_DATABASE_MODE=supabase` and `LINE_MEDIA_MODE=local`. The independent values
override the legacy `LINE_STORAGE_MODE`. The same record page, LINE history,
employee lookup and browser test flow use the configured database. This mixed
setup still requires this computer for photos and the temporary LINE webhook.

For testing without Supabase or Google Drive, set `LINE_STORAGE_MODE=local` and
run `pnpm dev`. Open `/line/local-test` for the same conversation backed by real
on-disk PostgreSQL and image files. Employee selection, drafts and confirmed
entries survive refresh and server restart. This test page makes no calls to
LINE, Google or email services.
The local employee directory is seeded/synchronized from IHD's existing validated
master-data JSON when the database opens; removed employees become inactive.

Local data is stored in `.local-data/line/database` and images in
`.local-data/line/media/YYYY/YYYY-MM/employeeId_name/หลักฐาน`. The entire directory
is ignored by Git. `IHD_LOCAL_DATA_DIR` optionally overrides its root. Use one
server process for this local PGlite database. Back up the whole directory with
the server stopped, rather than copying live database files.

With `LINE_INTAKE_ENABLED=true` and LINE credentials present, the signed webhook
also uses these local adapters. LINE still requires an externally reachable HTTPS
URL to call a local server; no tunnel is created automatically. Local mode is
blocked on Vercel. The original `/line/simulator` remains an in-memory demo.

### Monthly personal summaries

On the first day at 08:00 Bangkok, the bot sends each linked employee with work
in the previous month a private summary link. The page reuses the real expense
form and supporting evidence, with browser Save as PDF. Unedited LINE entries
use 300 baht per day; saved web amounts override it. Reports and copied images
expire with their work month at the start of the third month.

Email from `inhouse.mkt@toagroup.com` is not connected. The agreed fallback is
the private LINE summary link, not an automatically attached PDF or sent email.
