import { describe, expect, it } from "vitest";
import {
  findRequesterByKey,
  findTeamByRequesterKey,
  masterData
} from "@/lib/master-data";

describe("master data", () => {
  it("loads validated team and approver data", () => {
    expect(masterData.teams).toHaveLength(2);
    expect(masterData.teams.map((team) => team.members.length)).toEqual([5, 3]);
    expect(masterData.approvers.authorizedBy.position).toBe(
      "Head of marketing"
    );
  });

  it("sorts team members by Thai first name order", () => {
    expect(masterData.teams[0].members.map((member) => member.firstName)).toEqual([
      "ชญานิน",
      "ชินวัตร",
      "ธนากร",
      "บรรณพรต",
      "พัชรีพร"
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
    expect(findRequesterByKey("11250707")?.department).toBe(
      "Corporate Marketing"
    );
    expect(findRequesterByKey("11250708")?.email).toBe(
      "pakawat_j@toagroup.com"
    );
  });

  it("finds the team for an existing requester", () => {
    expect(findTeamByRequesterKey("60112369")?.key).toBe(
      "in-house-production"
    );
    expect(findTeamByRequesterKey("11240479")?.key).toBe(
      "corporate-marketing"
    );
  });
});
