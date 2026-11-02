import { z } from "zod";

const rawTeamMemberSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    name: z.string().min(1),
    employeeId: z.string().min(1),
    email: z.string().email(),
    position: z.string().min(1)
  })
  .strict();

export const teamSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    members: z.array(rawTeamMemberSchema).min(1)
  })
  .strict()
  .transform((team) => ({
    ...team,
    members: team.members.map((member) => ({
      ...member,
      department: team.name
    }))
  }));

export const approverSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    name: z.string(),
    position: z.string()
  })
  .strict();

export const masterDataSchema = z
  .object({
    teams: z.array(teamSchema).min(1),
    approvers: z
      .object({
        authorizedBy: approverSchema,
        reviewedBy: approverSchema
      })
      .strict()
  })
  .strict();

export type Approver = z.infer<typeof approverSchema>;
export type MasterData = z.infer<typeof masterDataSchema>;
export type Team = MasterData["teams"][number];
export type TeamMember = Team["members"][number];
