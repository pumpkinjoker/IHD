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
