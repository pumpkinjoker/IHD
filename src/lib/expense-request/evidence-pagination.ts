export const A4_PAGE_HEIGHT_MM = 297;
export const EVIDENCE_PAGE_HEADER_HEIGHT_MM = 27.5;
export const EVIDENCE_PAGE_BOTTOM_MARGIN_MM = 4.5;
export const EVIDENCE_FIRST_PAGE_INTRO_HEIGHT_MM = 41.5;
export const EVIDENCE_BLOCK_HEIGHT_MM = 66.25;

const evidencePageUsableHeight =
  A4_PAGE_HEIGHT_MM -
  EVIDENCE_PAGE_HEADER_HEIGHT_MM -
  EVIDENCE_PAGE_BOTTOM_MARGIN_MM;

export function getEvidencePageCapacity(hasFirstPageIntro: boolean) {
  const availableHeight =
    evidencePageUsableHeight -
    (hasFirstPageIntro ? EVIDENCE_FIRST_PAGE_INTRO_HEIGHT_MM : 0);

  return Math.max(1, Math.floor(availableHeight / EVIDENCE_BLOCK_HEIGHT_MM));
}

export function paginateEvidenceItems<T>(items: T[]) {
  const pages: T[][] = [];
  let nextIndex = 0;

  while (nextIndex < items.length) {
    const capacity = getEvidencePageCapacity(pages.length === 0);

    pages.push(items.slice(nextIndex, nextIndex + capacity));
    nextIndex += capacity;
  }

  return pages;
}
