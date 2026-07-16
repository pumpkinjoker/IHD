# Codex Project Brief — Internal Document Generator

## 1. บทบาทของ Codex

You are a **Senior Software Architect, Senior Frontend Engineer, and Print-CSS Specialist**.

Your task is to design and build a small internal web application for the In House Production team.

The application is a **template-based document generator**. It is not a workflow system, approval platform, archive, database application, or document management system.

Your priorities are:

1. Accuracy of the official company document layout
2. Ease of use
3. Reliable A4 printing
4. Simple and maintainable code
5. Easy extension for additional document templates in the future
6. Avoiding unnecessary infrastructure and overengineering

Do not introduce a database, authentication, backend service, audit log, online approval flow, or permanent document storage unless explicitly requested later.

---

# 2. Project Overview

Build an internal web application where a user can:

1. Open the website
2. Select the document type
3. Select the requester from the team list
4. Enter the document date
5. Enter work and expense information
6. Upload one evidence image for each work item
7. Click Confirm
8. Review the generated official documents
9. Return to edit if anything is incorrect
10. Print or save the complete document package as PDF
11. Finish

The first supported document is:

- **เอกสารเบิกเงิน / Expense Request**

The printed package consists of:

- Page 1: Official Expense Request form
- Page 2 onward: Supporting evidence template containing work information and one image per work item

The application must be designed so more document types can be added later without rewriting the shared application structure.

---

# 3. Product Scope

## Included in Version 1

- Document selection page
- Expense Request form
- Team member selection
- Automatic requester information filling
- Static approver information from JSON
- Work and expense item entry
- One evidence image per work item
- Automatic row totals
- Automatic grand total
- Thai Baht amount-to-text conversion
- Preview mode
- Back-to-edit functionality
- Browser printing
- Save as PDF through the browser print dialog
- Temporary browser-side state
- A4 print layout
- Responsive input experience on desktop
- Extensible document-template architecture

## Explicitly Excluded

Do not implement:

- Database
- Supabase
- Firebase
- Authentication
- Login
- User accounts
- Backend API
- Online approval
- Electronic signature
- Audit log
- Edit history
- Document history
- Permanent storage
- Cloud image upload
- Email sending
- PDF-generation library
- Server-side PDF generation
- Admin dashboard
- Settings page that attempts to write JSON on Vercel
- Complex generic form-builder engine

This is a simple internal document generator.

---

# 4. Technology Stack

Use:

- Next.js with App Router
- TypeScript with strict mode
- React
- Tailwind CSS
- shadcn/ui for application controls only
- React Hook Form
- Zod
- Browser `sessionStorage`
- Native browser Print dialog
- HTML and CSS for document rendering
- GitHub for source control
- Vercel for deployment

Do not use a PDF rendering library for the main document.

The printable documents must be implemented using semantic HTML and dedicated print CSS.

Use exact stable package versions that are compatible with each other at implementation time.

---

# 5. Master Data

Use one JSON file only:

```text
src/data/master-data.json
```

It contains exactly two main data sets:

```json
{
  "team": [
    {
      "name": "ธนากร ฟูเต็มวงศ์",
      "employeeId": "11260369",
      "department": "In House Production",
      "position": "S2",
      "email": "thanakorn_f@toagroup.com"
    }
  ],
  "approvers": {
    "authorizedBy": {
      "name": "นพคุณ ปัญญาเสริมสุข",
      "position": "Head of Marketing"
    },
    "reviewedBy": {
      "name": "",
      "position": "ฝ่ายบัญชีทั่วไป"
    }
  }
}
```

Requirements:

- The requester dropdown reads from `team`.
- When a requester is selected, automatically fill:
  - name
  - employee ID
  - department
  - position
  - email
- The approver section reads from `approvers`.
- Do not hardcode employee or approver names inside React components.
- Team members may be added, edited, or removed directly in the JSON file.
- Approver changes are performed directly in the JSON file and redeployed.
- No active/inactive flag is required.
- No historical snapshot is required because no document is stored permanently.

Create TypeScript types and validate the imported master data.

---

# 6. Official Source Documents

The official company form is the source of truth.

Reference assets should be placed in the repository, for example:

```text
docs/reference/expense-request-form.numbers
docs/reference/expense-request-form.png
docs/reference/evidence-template.png
public/brand/toa-logo.png
```

Important:

- Use the **Expense Request source sheet** in the Numbers file as the master reference for the expense form.
- Use the evidence-template screenshot as the visual reference for supporting evidence pages.
- The official layout must not be redesigned as a modern card-based form.
- Preserve company wording, bilingual labels, table structure, borders, spacing, notes, and signature areas.
- Do not replace the official form with a simplified approximation.
- The application form page may be optimized for data entry, but the final preview and print output must match the official templates closely.

---

# 7. User Flow

## Main Flow

```text
Home / Select document
        ↓
Choose เอกสารเบิกเงิน / Expense Request
        ↓
Select requester
        ↓
Enter document date
        ↓
Enter work and expense items
        ↓
Upload one evidence image per work item
        ↓
Click Confirm
        ↓
Validate data
        ↓
Preview document package
        ↓
Back to Edit OR Print
        ↓
Finish
```

## Required Behavior

- Data must not be lost when going from the form to preview and back.
- Refreshing during the active browser tab should restore the current draft when possible.
- Closing the tab may clear the draft.
- Do not put form data into the URL.
- Do not store submitted documents permanently.
- Provide a clear “Create new document” action after printing or returning to the application.

---

# 8. Routes

Use a simple route structure such as:

```text
/
  Document selection

/documents/expense-request/new
  Expense Request data-entry form

/documents/expense-request/preview
  Printable document package preview
```

A route-based approach is preferred over a single large component.

The architecture must allow future routes such as:

```text
/documents/leave/new
/documents/purchase-request/new
/documents/equipment-request/new
```

Do not implement those future forms in Version 1.

---

# 9. Form Data Model

Create clear TypeScript types.

Suggested model:

```ts
type ExpenseRequestForm = {
  requesterKey: string;
  documentDate: string;
  workItems: ExpenseWorkItem[];
};

type ExpenseWorkItem = {
  id: string;
  workDate: string;
  subject: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;

  travelFrom: string;
  travelTo: string;
  totalKilometers: number | null;
  fare: number | null;
  accommodation: number | null;
  perDiem: number | null;
  entertainment: number | null;
  otherExpense: number | null;

  evidenceImage: EvidenceImage | null;
};

type EvidenceImage = {
  fileName: string;
  mimeType: string;
  dataUrl: string;
};
```

The exact model may be refined, but keep it small and understandable.

Use a stable unique ID for each work item so form entries and images remain correctly associated.

---

# 10. Expense Request Form Requirements

The official Expense Request form contains:

## Header

- Company name in Thai
- Company name in English
- Form title
- Document date
- Pay to / requester name
- Employee ID
- Department
- Total amount
- Total amount in words
- Email

## Expense Table

Each row contains:

- Date
- Items / purpose
- Travel from
- Travel to
- Total kilometers
- Fare
- Accommodation
- Per diem
- Entertainment
- Other expenses
- Total

## Entertainment Details

The official section must remain visible in the printed template.

Fields include:

- Entertained person or shop owner
- Shop name
- Business purpose
- Amount

If Version 1 does not require entering entertainment details separately, preserve the official visual section and leave it blank. Do not remove it from the template.

## Signature Section

Display:

- Requested by
- Authorized by
- Reviewed by
- Names
- Positions
- Signature lines

The requester name and position come from the selected team member.

The authorized and reviewed information comes from `master-data.json`.

## Official Notes

Preserve the official explanatory text shown on the source form.

Do not paraphrase company wording.

---

# 11. Calculation Rules

For each expense row:

```text
row total =
fare
+ accommodation
+ per diem
+ entertainment
+ other expense
```

Grand total:

```text
grand total = sum of all row totals
```

Requirements:

- Empty monetary fields count as zero.
- Do not allow negative values.
- Format money with two decimal places.
- Format thousands separators.
- Update totals automatically.
- Display the same grand total in every required position on the official form.
- Convert the grand total into Thai Baht text automatically.
- Example:
  - `1,500.00`
  - `หนึ่งพันห้าร้อยบาทถ้วน`
- Write unit tests for total calculation and Thai amount-to-text conversion.

---

# 12. Date and Time Rules

Internal date values should use ISO format:

```text
YYYY-MM-DD
```

Display dates in the document using the Thai Buddhist calendar as required by the reference form.

Example:

```text
2026-07-04
→ 04/07/69
```

For the evidence template, use a readable full Thai date:

```text
4 กรกฎาคม 2569
```

Requirements:

- Avoid JavaScript timezone shifts.
- Treat document dates as date-only values.
- Centralize date formatting in utility functions.
- Do not rely on ambiguous two-digit years internally.

Time fields:

- Use `HH:mm` internally.
- Display according to the official template, for example:
  - `08.00 - 17.00 น.`

---

# 13. Evidence Image Requirements

Each work item supports exactly **one image**.

Requirements:

- Accept JPEG, JPG, PNG, and WebP.
- Provide:
  - upload
  - preview
  - replace
  - remove
- Reject unsupported file types with a clear Thai error message.
- Set a reasonable client-side file-size limit.
- Do not upload images to any server.
- Store the image temporarily in browser state and `sessionStorage`.
- Use a data URL or another browser-only representation that survives navigation between form and preview.
- Compress or resize large images client-side if needed to prevent excessive browser memory use.
- Preserve image aspect ratio.
- Do not crop the evidence image.
- Use `object-fit: contain`.
- All evidence image areas must have the same fixed height.
- Landscape and portrait images must occupy the same vertical layout space.
- Center images horizontally and vertically within the fixed image area.
- The image must not stretch or distort.

Example implementation concept:

```css
.evidence-image-frame {
  height: 58mm;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.evidence-image-frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

The final fixed size must be calibrated against the official evidence template rather than blindly using the example value.

---

# 14. Supporting Evidence Template

The document package must generate one evidence section per work item.

The evidence template is visually based on the supplied company reference and includes:

- TOA logo and company heading
- Title:
  - `บันทึกเบี้ยเลี้ยง - การปฏิบัติงานนอกบริษัท`
- Requester information
- Requester position
- Department or work line
- Requester signature line
- Approver name
- Approver position
- Approver signature line
- Work date
- Subject
- Time
- Location
- Details
- One evidence image

The evidence output must use a fixed repeated layout.

## Pagination Strategy

Prefer a predictable print layout.

For Version 1:

- Page 1 is the official Expense Request form.
- Each work item generates one supporting evidence page.
- Each evidence page uses the same dimensions and vertical spacing.
- If a work item has no image, still render the evidence page with an empty image placeholder only if evidence is optional.
- If evidence is mandatory, block confirmation and show a validation error instead.

Default Version 1 rule:

> One work item requires one evidence image.

This keeps output predictable and aligns with accounting requirements.

---

# 15. Form Validation

Use Zod.

Before opening preview, validate:

- A requester is selected.
- Document date is present.
- At least one work item exists.
- Each work item has a work date.
- Each work item has a subject or work description.
- Monetary values are zero or greater.
- Start time is not after end time when both are present.
- Each work item has one valid evidence image.
- Image type is supported.
- Image size is within the configured limit.

Display validation messages in Thai.

Focus or scroll to the first invalid field.

Do not silently discard invalid values.

---

# 16. State Management

Do not add Redux or another heavy state library.

Use:

- React Hook Form for form state
- A small application context or dedicated storage service if needed
- `sessionStorage` for temporary persistence between form and preview

Requirements:

- Centralize storage keys.
- Add schema versioning to stored data.
- Safely handle invalid or outdated session data.
- Provide a reset function.
- Revoke temporary object URLs if object URLs are used.
- Do not store state in query parameters.

Suggested storage shape:

```ts
type StoredExpenseRequestDraft = {
  version: 1;
  savedAt: string;
  data: ExpenseRequestForm;
};
```

---

# 17. UI Principles

## Application UI

The non-document application UI should be clean, simple, and usable.

Use shadcn/ui for controls such as:

- buttons
- select
- dialog
- alert
- input
- date control
- confirmation prompt

Avoid an unnecessarily elaborate dashboard.

## Data Entry

The data-entry page may use a practical form layout rather than forcing users to type directly into the tiny official table.

Suggested sections:

1. Requester
2. Document date
3. Work items
4. Expense amounts
5. Evidence image
6. Summary
7. Confirm

Each work item can be presented as an editable section.

Provide:

- Add work item
- Remove work item
- Duplicate work item if useful
- Clear labels
- Automatic totals

## Preview

The preview must show the real printed output, not a stylized summary.

Display A4 pages against a neutral background.

Action buttons must remain outside the printable page.

Required buttons:

- Back to Edit
- Print
- Create New Document

---

# 18. Print Requirements

Use dedicated print CSS.

Page dimensions:

```css
@page {
  size: A4 portrait;
  margin: 0;
}
```

Each printable page:

```css
.print-page {
  width: 210mm;
  height: 297mm;
  page-break-after: always;
}
```

The last page must not create an extra blank page.

During print:

- Hide navigation
- Hide action buttons
- Hide upload controls
- Hide non-print UI
- Remove page shadows
- Preserve black table borders
- Preserve official text
- Preserve images
- Preserve fixed image height
- Print backgrounds where required
- Prevent table rows and evidence sections from splitting
- Use `break-inside: avoid`
- Ensure Page 1 is exactly one A4 page
- Ensure each evidence page is exactly one A4 page
- Avoid browser scaling surprises
- Avoid clipping at page edges

Add a user-facing printing note recommending:

- Paper size: A4
- Scale: 100%
- Margins: None or Default according to browser test
- Background graphics: Enabled if required by the template
- Headers and footers: Disabled

Test printing in current Chrome.

---

# 19. Accessibility and Language

- Main user-facing language: Thai
- Code identifiers: English
- Provide meaningful labels for inputs
- Ensure keyboard navigation
- Use accessible error messages
- Use alt text for the TOA logo
- Uploaded evidence images should use descriptive fallback alt text
- Do not depend on color alone to show validation
- Maintain readable contrast in application UI

The official document layout may use smaller text because it must match the source form, but the input interface should remain readable.

---

# 20. Suggested Project Structure

Codex may improve this structure while keeping responsibilities separate:

```text
src/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── documents/
│       └── expense-request/
│           ├── new/
│           │   └── page.tsx
│           └── preview/
│               └── page.tsx
│
├── components/
│   ├── app/
│   │   ├── document-type-card.tsx
│   │   └── page-header.tsx
│   │
│   ├── forms/
│   │   └── expense-request/
│   │       ├── expense-request-entry-form.tsx
│   │       ├── requester-select.tsx
│   │       ├── work-item-editor.tsx
│   │       ├── expense-fields.tsx
│   │       ├── evidence-image-input.tsx
│   │       └── expense-summary.tsx
│   │
│   ├── documents/
│   │   ├── shared/
│   │   │   ├── print-page.tsx
│   │   │   └── company-header.tsx
│   │   └── expense-request/
│   │       ├── expense-request-document-page.tsx
│   │       ├── expense-request-header.tsx
│   │       ├── expense-request-expense-table.tsx
│   │       ├── expense-request-entertainment-table.tsx
│   │       ├── expense-request-signature-section.tsx
│   │       └── evidence-page.tsx
│   │
│   └── ui/
│
├── data/
│   └── master-data.json
│
├── lib/
│   ├── calculations/
│   │   └── expense.ts
│   ├── dates/
│   │   └── thai-date.ts
│   ├── images/
│   │   └── process-evidence-image.ts
│   ├── money/
│   │   ├── format-money.ts
│   │   └── thai-baht-text.ts
│   ├── storage/
│   │   └── expense-request-session-storage.ts
│   └── master-data.ts
│
├── schemas/
│   ├── expense-request-form.schema.ts
│   └── master-data.schema.ts
│
├── types/
│   ├── expense-request.ts
│   └── master-data.ts
│
└── styles/
    ├── print.css
    ├── expense-request-document.css
    └── evidence-document.css

docs/
└── reference/
    ├── expense-request-form.numbers
    ├── expense-request-form.png
    └── evidence-template.png

public/
└── brand/
    └── toa-logo.png
```

Avoid unnecessary abstraction. A component should be reusable because it has a clear responsibility, not because every HTML block must become a separate file.

---

# 21. Extensibility Rules

The codebase should support additional document templates later.

Shared concerns:

- document selection
- team master data
- requester selection
- company header
- date formatting
- money formatting
- print page wrapper
- print controls
- temporary storage patterns

Template-specific concerns:

- Expense Request form layout
- Expense Request fields
- Expense Request calculations
- Expense Request evidence page
- Expense Request validation

Do not create a universal schema-driven form builder in Version 1.

Use explicit components for each document type.

Future templates should be added through new route and component folders while reusing shared utilities.

---

# 22. Quality Requirements

Before considering the feature complete:

- TypeScript passes with no errors.
- ESLint passes.
- Production build succeeds.
- No console errors.
- Form validation works.
- Back-to-edit retains all data.
- Image replace and remove work.
- Totals are correct.
- Thai amount text is correct for common values.
- Buddhist Era dates are correct.
- The Expense Request page fits on one A4 page.
- Every evidence page fits on one A4 page.
- Images retain aspect ratio.
- Images have identical display height.
- Printing produces no unexpected blank page.
- Application deploys successfully to Vercel.
- README contains setup, use, and deployment instructions.

---

# 23. Testing Requirements

Use an appropriate lightweight testing setup.

At minimum, test:

## Unit Tests

- Expense row total
- Grand total
- Empty amount handling
- Money formatting
- Thai Baht text
- ISO date to short Thai Buddhist date
- ISO date to full Thai Buddhist date
- Master-data validation

## Browser / E2E Tests

Use Playwright for critical flow:

1. Open home
2. Select Expense Request
3. Select requester
4. Fill document date
5. Add work item
6. Enter expense
7. Upload one image
8. Confirm
9. See preview
10. Return to edit
11. Confirm values are retained
12. Return to preview

Print layout may require manual visual verification in addition to automated tests.

---

# 24. Implementation Plan

Work in small, reviewable milestones.

## Milestone 1 — Architecture and Initialization

- Inspect all reference files
- Document visual measurements and assumptions
- Initialize Next.js TypeScript project
- Configure Tailwind CSS
- Configure shadcn/ui
- Configure linting and testing
- Create folder structure
- Add `master-data.json`
- Add types and schemas
- Add README skeleton

## Milestone 2 — Application Shell

- Create document selection page
- Add Expense Request document option
- Create basic routes
- Add shared page layout
- Add temporary storage service

## Milestone 3 — Expense Request Input Form

- Requester selection
- Automatic requester data filling
- Document date
- Dynamic work items
- Expense fields
- One evidence image per item
- Validation
- Automatic totals
- Thai amount-to-text

## Milestone 4 — Official Expense Request Preview

- Reproduce the official Expense Request A4 layout
- Insert dynamic data
- Match table borders and spacing
- Add signature and notes
- Calibrate to exactly one A4 page

## Milestone 5 — Evidence Pages

- Reproduce the evidence template
- One page per work item
- Fixed-height image frame
- `object-fit: contain`
- Thai date and time formatting
- Requester and approver information
- Print pagination

## Milestone 6 — Print and Polish

- Dedicated print CSS
- Hide controls
- Prevent blank pages
- Verify Chrome print
- Add print instructions
- Accessibility review
- Responsive form improvements
- Tests
- README completion
- Production build
- Vercel readiness

Commit after each milestone using clear conventional commit messages.

---

# 25. Codex Working Rules

1. Inspect the repository and reference assets before coding.
2. Do not guess official text that can be read from the supplied reference.
3. Do not simplify the official layout without explaining why.
4. Do not introduce services not listed in the approved stack.
5. Do not add a database.
6. Do not add authentication.
7. Do not add online approvals.
8. Do not upload images to the cloud.
9. Do not use absolute pixel positioning for the entire document unless necessary.
10. Prefer CSS Grid and HTML tables where they accurately represent the official structure.
11. Use millimeters for print-critical dimensions where appropriate.
12. Keep form-entry UI separate from print-template UI.
13. Centralize date, money, calculation, image, and storage utilities.
14. Keep code typed and avoid `any`.
15. Run lint, tests, and build after meaningful changes.
16. Fix errors rather than merely documenting them.
17. Keep implementation simple.
18. Ask for clarification only when a requirement materially blocks implementation.
19. When a visual choice is uncertain, document the assumption in `docs/implementation-notes.md`.
20. Do not finish until print output has been manually verified against the reference.

---

# 26. First Instruction to Codex

Start with this task:

```text
Read the complete project brief and inspect every supplied reference asset.

Do not write application code yet.

First produce:

1. A concise architecture proposal
2. The planned folder structure
3. The data flow from form to preview to print
4. The state and sessionStorage strategy
5. The image-processing strategy
6. The print and pagination strategy
7. A list of measurements and details that must be extracted from the Expense Request and evidence references
8. Any assumptions or blockers
9. A milestone-by-milestone implementation plan
10. A checklist mapping every requirement in this brief to an implementation area

Do not add a database, authentication, backend, approval workflow, document history, or permanent storage.

Wait for approval before initializing or modifying the project.
```

---

# 27. Second Instruction After Architecture Approval

After the architecture is approved, give Codex this instruction:

```text
The architecture is approved.

Initialize the project and complete Milestone 1 only.

Requirements:

- Create the Next.js TypeScript project
- Configure Tailwind CSS
- Configure shadcn/ui
- Configure React Hook Form and Zod
- Configure the agreed testing tools
- Create the approved folder structure
- Add typed and validated master-data.json
- Add reference asset folders
- Add README setup instructions
- Add docs/implementation-notes.md
- Run lint, tests, and production build
- Fix all errors
- Do not implement the Expense Request form or print templates yet

Commit the work with:

chore: initialize document generator architecture

Then report:
- files created
- dependencies installed
- commands run
- test/build results
- assumptions
- next milestone
```

---

# 28. Definition of Done for Version 1

Version 1 is complete when a team member can:

1. Open the deployed Vercel website
2. Select เอกสารเบิกเงิน / Expense Request
3. Select their name
4. See employee information filled automatically
5. Enter the document date
6. Enter one or more work items
7. Enter expense values
8. Upload exactly one image for each work item
9. See calculated totals
10. Confirm the form
11. Review the official Expense Request page
12. Review one evidence page per work item
13. Return to edit without losing data
14. Print the complete package in one browser print action
15. Obtain correctly formatted A4 pages without broken layouts or distorted images
16. Finish without any data being permanently stored
