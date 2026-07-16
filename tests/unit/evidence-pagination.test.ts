import { describe, expect, it } from "vitest";
import {
  EVIDENCE_BLOCK_HEIGHT_MM,
  getEvidencePageCapacity,
  paginateEvidenceItems
} from "@/lib/expense-request/evidence-pagination";

describe("supporting evidence pagination", () => {
  it("derives page capacity from fixed block height", () => {
    expect(EVIDENCE_BLOCK_HEIGHT_MM).toBeGreaterThan(0);
    expect(getEvidencePageCapacity(true)).toBeLessThan(
      getEvidencePageCapacity(false)
    );
  });

  it("keeps complete evidence blocks together across pages", () => {
    const pages = paginateEvidenceItems(["1", "2", "3", "4", "5"]);

    expect(pages.flat()).toEqual(["1", "2", "3", "4", "5"]);
    expect(pages.every((page) => page.length > 0)).toBe(true);
    expect(pages[0].length).toBe(getEvidencePageCapacity(true));
    expect(pages[1].length).toBeLessThanOrEqual(getEvidencePageCapacity(false));
  });
});
