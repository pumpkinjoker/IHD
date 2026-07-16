import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money/format-money";
import { toThaiBahtText } from "@/lib/money/thai-baht-text";

describe("money formatting", () => {
  it("formats money with thousands separators and two decimals", () => {
    expect(formatMoney(1500)).toBe("1,500.00");
  });

  it("converts whole baht amount to Thai text", () => {
    expect(toThaiBahtText(1500)).toBe("หนึ่งพันห้าร้อยบาทถ้วน");
  });

  it("converts satang amount to Thai text", () => {
    expect(toThaiBahtText(21.5)).toBe("ยี่สิบเอ็ดบาทห้าสิบสตางค์");
  });
});
