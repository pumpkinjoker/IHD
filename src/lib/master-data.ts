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

export function findTeamByKey(teamKey: string) {
  return masterData.teams.find((team) => team.key === teamKey) ?? null;
}

export function findTeamByRequesterKey(requesterKey: string) {
  return (
    masterData.teams.find((team) =>
      team.members.some(
        (member) => getRequesterKey(member) === requesterKey
      )
    ) ?? null
  );
}

export function findRequesterByKey(requesterKey: string) {
  const team = findTeamByRequesterKey(requesterKey);

  return (
    team?.members.find(
      (member) => getRequesterKey(member) === requesterKey
    ) ?? null
  );
}
