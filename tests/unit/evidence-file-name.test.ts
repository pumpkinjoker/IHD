import { describe, expect, it } from "vitest";
import { evidenceFileName } from "@/lib/images/evidence-file-name";

describe("date-based evidence names", () => {
  it("uses the work date as yyyymmdd and preserves the image extension", () => {
    expect(evidenceFileName("2026-10-26", "image/jpeg")).toBe("20261026.jpg");
    expect(evidenceFileName("2026-02-01", "image/png")).toBe("20260201.png");
    expect(evidenceFileName("2024-02-29", "image/webp")).toBe("20240229.webp");
  });
  it("rejects impossible dates and unsupported image types", () => {
    expect(() => evidenceFileName("2026-02-29", "image/jpeg")).toThrow();
    expect(() => evidenceFileName("20261026", "image/jpeg")).toThrow();
    expect(() => evidenceFileName("2026-10-26", "text/plain")).toThrow();
  });
});
