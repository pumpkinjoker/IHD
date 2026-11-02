import { masterData } from "@/lib/master-data";
import { lineStorageModes } from "@/lib/line/storage-config";
import { teamSchema, type Team } from "@/schemas/master-data.schema";

type DirectoryRow = { employee_id: string; name: string; email: string; team: string; position: string };

/** The web form and LINE share the active employee directory. Secrets stay on the server. */
export async function loadExpenseTeams(env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): Promise<Team[]> {
  if (lineStorageModes(env).database === "local" || (!env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY)) {
    if (env.VERCEL) throw new Error("Employee database is not configured");
    return masterData.teams;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Employee database is not configured");
  const params = new URLSearchParams({ active: "eq.true", select: "employee_id,name,email,team,position", order: "team.asc,name.asc" });
  const response = await request(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/ihd_employee_directory?${params}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    cache: "no-store", signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error("Employee directory is unavailable");
  const rows: DirectoryRow[] = await response.json();
  const groups = new Map<string, DirectoryRow[]>();
  for (const row of rows) groups.set(row.team, [...(groups.get(row.team) ?? []), row]);
  return [...groups].map(([name, members]) => teamSchema.parse({
    key: masterData.teams.find(team => team.name === name)?.key ?? `directory:${name}`,
    name,
    members: members.map(row => {
      const [firstName, ...rest] = row.name.trim().split(/\s+/);
      return { employeeId: row.employee_id, name: row.name, firstName, lastName: rest.join(" "), email: row.email, position: row.position };
    })
  }));
}
