# Implementation Notes

## Reference Assets

Reference assets are local-only and ignored by Git. Place supplied company
reference files in `docs/reference/` when visual inspection is needed, but do
not commit those images, PDFs, or workbook exports.

- `docs/reference/expense-request-form.png`
  - Expense Request form visual reference.
  - Image dimensions: 1354 x 1738 px.
  - The image is not an exact A4 aspect ratio, so it should be used for wording, table structure, relative spacing, and first-pass visual matching. A PDF or XLSX export from the source workbook would be better for precise page geometry.
- `docs/reference/evidence-template.pdf`
  - Illustrator-exported supporting evidence template.
  - PDF dimensions: A4 portrait, 595.276 x 841.89 pt.
  - Rendered at 144 dpi to 1191 x 1684 px.
- `docs/reference/evidence-template-page-1.png`
  - Rendered inspection image from evidence PDF page 1.
- `docs/reference/evidence-template-page-2.png`
  - Rendered inspection image from evidence PDF page 2.

## Expense Request Form Details To Preserve

The official Expense Request layout is based on the sheet named ASA in the provided Numbers file.

- Thai top-left usage note: `สำหรับการเบิกค่าใช้จ่าย`.
- Company names:
  - `บริษัท ทีโอเอ เพ้นท์ (ประเทศไทย) จำกัด (มหาชน)`
  - `TOA PAINT (THAILAND) PUBLIC COMPANY LIMITED`
- Title: `ใบเบิกค่าใช้จ่าย (Request for Check / Cash )`.
- Header fields:
  - Date
  - Pay to
  - ID Employee
  - Department
  - Total Amount
  - Total Amount in words
  - E-mail
- Expense table columns:
  - D/M/Y
  - Items
  - Place from/to
  - Total Kms.
  - Fare
  - Accommodation
  - Per diem
  - Entertain
  - Other exps.
  - Total
- Entertainment detail section must remain visible even if blank in Version 1.
- Official note beginning with `** ค่ารับรอง`.
- Signature blocks:
  - Requested by
  - Authorized by
  - Reviewed by

## Expense Request Form Measurements

Current source: PNG only.

- Detected main table vertical lines in the PNG at approximately x = 17, 113, 384, 498, 614, 708, 791, 904, 995, 1093, 1204, 1302 px.
- Detected main table horizontal lines in the PNG from approximately y = 316 px through y = 1338 px, followed by entertainment and signature sections.
- These pixel measurements are useful for proportional column planning, but not final millimeter calibration because the PNG is not exact A4.

## Evidence Template Measurements

Current source: A4 PDF, rendered at 1191 x 1684 px.

Approximate conversion at render scale:

- x-axis: 1 px = 0.17632 mm.
- y-axis: 1 px = 0.17637 mm.

Shared page geometry:

- Outer content box left edge: x = 28 px, about 4.94 mm.
- Outer content box right edge: x = 1160 px, about 204.53 mm.
- Vertical split line: x = 594 px, about 104.74 mm.
- Content box width: about 199.59 mm.

Page 1 detected horizontal rules:

- y = 157 px, about 27.69 mm.
- y = 230 px, about 40.56 mm.
- y = 375 px, about 66.14 mm.
- y = 417 px, about 73.54 mm.
- y = 532 px, about 93.83 mm.
- y = 753 px, about 132.80 mm.
- y = 795 px, about 140.21 mm.
- y = 910 px, about 160.49 mm.
- y = 1102 px, about 194.36 mm.
- y = 1144 px, about 201.76 mm.
- y = 1258 px, about 221.87 mm.
- y = 1511 px, about 266.49 mm.

Page 2 detected horizontal rules:

- y = 157 px, about 27.69 mm.
- y = 199 px, about 35.10 mm.
- y = 310 px, about 54.67 mm.
- y = 542 px, about 95.59 mm.
- y = 583 px, about 102.82 mm.
- y = 699 px, about 123.28 mm.
- y = 906 px, about 159.79 mm.
- y = 947 px, about 167.02 mm.
- y = 1062 px, about 187.30 mm.
- y = 1277 px, about 225.22 mm.
- y = 1319 px, about 232.63 mm.
- y = 1434 px, about 252.91 mm.
- y = 1657 px, about 292.24 mm.

## Pagination Decision

The evidence PDF reference shows multiple evidence entries per A4 page. The project brief specifies the Version 1 default as one work item per evidence page for predictable printing. Version 1 will follow the brief unless this is explicitly changed later.

## Assumptions

- The local-only `docs/reference/expense-request-form.png` file is the official Expense Request visual reference for Version 1 until an XLSX or PDF export is provided.
- The local-only `docs/reference/evidence-template.pdf` file is the official evidence visual reference.
- The TOA logo will either be extracted from the evidence PDF or supplied separately before template implementation.
- Evidence images are mandatory for each work item.
- Chrome is the primary browser for print verification.
- Browser print will be used to save PDF; no PDF library will render the main document.

## Blockers And Follow-Up Reference Needs

- Precise Expense Request millimeter layout is blocked by the current PNG not matching A4 aspect ratio.
- If possible, export the Expense Request form from Numbers/Excel as PDF or XLSX for exact page/cell dimensions.
- If possible, provide a standalone TOA logo image for `public/brand/toa-logo.png`.
