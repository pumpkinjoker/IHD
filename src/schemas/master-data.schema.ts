import { z } from "zod";

export const teamMemberSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    name: z.string().min(1),
    employeeId: z.string().min(1),
    email: z.string().email(),
    position: z.string().min(1),
    department: z.string().min(1)
  })
  .strict();

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
    team: z.array(teamMemberSchema).min(1),
    approvers: z
      .object({
        authorizedBy: approverSchema,
        reviewedBy: approverSchema
      })
      .strict()
  })
  .strict();

export type TeamMember = z.infer<typeof teamMemberSchema>;
export type Approver = z.infer<typeof approverSchema>;
export type MasterData = z.infer<typeof masterDataSchema>;
