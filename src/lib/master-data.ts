import rawMasterData from "@/data/master-data.json";
import {
  masterDataSchema,
  type MasterData,
  type Team,
  type TeamMember
} from "@/schemas/master-data.schema";

export const masterData: MasterData = masterDataSchema.parse(rawMasterData);

export function getRequesterKey(member: TeamMember) {
  return member.employeeId;
}

export function findTeamByKey(teamKey: string, teams: Team[] = masterData.teams) {
  return teams.find((team) => team.key === teamKey) ?? null;
}

export function findTeamByRequesterKey(requesterKey: string, teams: Team[] = masterData.teams) {
  return (
    teams.find((team) =>
      team.members.some(
        (member) => getRequesterKey(member) === requesterKey
      )
    ) ?? null
  );
}

export function findRequesterByKey(requesterKey: string, teams: Team[] = masterData.teams) {
  const team = findTeamByRequesterKey(requesterKey, teams);

  return (
    team?.members.find(
      (member) => getRequesterKey(member) === requesterKey
    ) ?? null
  );
}
