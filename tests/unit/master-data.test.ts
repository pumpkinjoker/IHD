import { describe, expect, it } from "vitest";
import { findRequesterByKey, masterData } from "@/lib/master-data";

describe("master data", () => {
  it("loads validated team and approver data", () => {
    expect(masterData.team).toHaveLength(1);
    expect(masterData.approvers.authorizedBy.position).toBe(
      "Head of marketing"
    );
  });

  it("finds requester by stable employee id key", () => {
    expect(findRequesterByKey("60112369")?.email).toBe(
      "thanakorn_f@toagroup.com"
    );
  });
});
