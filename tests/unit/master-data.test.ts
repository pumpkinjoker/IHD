import { describe, expect, it } from "vitest";
import { findRequesterByKey, masterData } from "@/lib/master-data";

describe("master data", () => {
  it("loads validated team and approver data", () => {
    expect(masterData.team).toHaveLength(1);
    expect(masterData.approvers.authorizedBy.position).toBe(
      "ผู้อำนวยการฝ่ายการตลาด"
    );
  });

  it("finds requester by stable employee id key", () => {
    expect(findRequesterByKey("60112112")?.email).toBe(
      "sadey_a@toagroup.com"
    );
  });
});
