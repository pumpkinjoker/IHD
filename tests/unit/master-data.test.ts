import { describe, expect, it } from "vitest";
import { findRequesterByKey, masterData } from "@/lib/master-data";

describe("master data", () => {
  it("loads validated team and approver data", () => {
    expect(masterData.team).toHaveLength(5);
    expect(masterData.approvers.authorizedBy.position).toBe(
      "Head of marketing"
    );
  });

  it("sorts team members by Thai first name order", () => {
    expect(masterData.team.map((member) => member.firstName)).toEqual([
      "ชญานิน",
      "ชรีพร",
      "ชินวัตร",
      "ธนากร",
      "บรรณพรต"
    ]);
  });

  it("finds requester by stable employee id key", () => {
    expect(findRequesterByKey("11200462")?.email).toBe(
      "chayanin_J@toagroup.com"
    );
    expect(findRequesterByKey("11240219")?.email).toBe(
      "phatchareepron_l@toagroup.com"
    );
    expect(findRequesterByKey("11240752")?.email).toBe(
      "bunaprot_b@toagroup.com"
    );
    expect(findRequesterByKey("60112369")?.email).toBe(
      "thanakorn_f@toagroup.com"
    );
    expect(findRequesterByKey("11240248")?.email).toBe(
      "chinawat_t@toagroup.com"
    );
  });
});
