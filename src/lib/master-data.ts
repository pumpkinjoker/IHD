import rawMasterData from "@/data/master-data.json";
import {
  masterDataSchema,
  type MasterData,
  type TeamMember
} from "@/schemas/master-data.schema";

export const masterData: MasterData = masterDataSchema.parse(rawMasterData);

export function getRequesterKey(member: TeamMember) {
  return member.employeeId;
}

export function findRequesterByKey(requesterKey: string) {
  return (
    masterData.team.find((member) => getRequesterKey(member) === requesterKey) ??
    null
  );
}
