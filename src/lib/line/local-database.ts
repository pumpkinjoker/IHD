import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { LineEvent } from "./webhook";
import type { IntakeReply } from "./intake";
import type { EmployeeWorkEntry } from "./employee-intake";
import { INITIAL_EMPLOYEE_INTAKE_STATE } from "./employee-intake";
import { masterData } from "@/lib/master-data";
import type { IntakeEmployee } from "./employee-intake";
import { RECORD_PAGE_SIZE, type EntryPage } from "./records";
import type { EventClaim, LineStore, StoredConversation } from "./store";

type LocalRuntime = typeof globalThis & { ihdLocalDatabases?: Map<string, Promise<PGlite>> };

export function localDataRoot() {
  if (process.env.VERCEL) throw new Error("Local intake storage cannot run on Vercel");
  return process.env.IHD_LOCAL_DATA_DIR
    ? path.resolve(/* turbopackIgnore: true */ process.env.IHD_LOCAL_DATA_DIR)
    : path.join(process.cwd(), ".local-data", "line");
}

export async function openLocalDatabase(root = localDataRoot()): Promise<PGlite> {
  if (process.env.VERCEL) throw new Error("Local intake storage cannot run on Vercel");
  // One database owner across development hot reloads. PGlite is single-process.
  const runtime = globalThis as LocalRuntime;
  const databases: Map<string, Promise<PGlite>> = runtime.ihdLocalDatabases ??= new Map<string, Promise<PGlite>>();
  const directory = path.resolve(/* turbopackIgnore: true */ root, "database");
  let opening = databases.get(directory);
  if (!opening) {
    opening = (async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const db = new PGlite(directory);
      try {
        await db.exec("create table if not exists public.ihd_local_migrations (id text primary key)");
        const version = "202610260001";
        const applied = await db.query("select id from public.ihd_local_migrations where id=$1", [version]);
        if (!applied.rows.length) {
          for (const role of ["anon", "authenticated", "service_role"]) {
            const exists = await db.query("select rolname from pg_roles where rolname=$1", [role]);
            if (!exists.rows.length) await db.exec(`create role ${role}${role === "service_role" ? " bypassrls" : ""}`);
          }
          const migration = await readFile(path.join(process.cwd(), "supabase/migrations/202610260001_line_intake.sql"), "utf8");
          await db.exec(migration);
          await db.query("insert into public.ihd_local_migrations(id) values($1)", [version]);
        }
        // Seed the local directory from the existing validated IHD source. Keep
        // removed staff inactive while historical work entries remain untouched.
        await db.exec(`create table if not exists public.ihd_employee_directory (
          employee_id text primary key, name text not null, email text not null,
          team text not null, position text not null, active boolean not null default true
        )`);
        const employees = masterData.teams.flatMap((team) => team.members.map((member) => ({
          employee_id: member.employeeId, name: member.name, email: member.email, team: team.name, position: member.position
        })));
        await db.transaction(async (tx) => {
          await tx.exec("update public.ihd_employee_directory set active=false");
          await tx.query(`insert into public.ihd_employee_directory(employee_id,name,email,team,position,active)
            select employee_id,name,email,team,position,true from jsonb_to_recordset($1::jsonb)
            as source(employee_id text,name text,email text,team text,position text)
            on conflict(employee_id) do update set name=excluded.name,email=excluded.email,
            team=excluded.team,position=excluded.position,active=true`, [JSON.stringify(employees)]);
        });
        return db;
      } catch (error) { await db.close(); throw error; }
    })();
    databases.set(directory, opening);
    opening.catch(() => { databases.delete(directory); });
  }
  return opening;
}

export async function closeLocalDatabase(root: string) {
  const databases = (globalThis as LocalRuntime).ihdLocalDatabases;
  const directory = path.resolve(/* turbopackIgnore: true */ root, "database");
  const opening = databases?.get(directory);
  databases?.delete(directory);
  if (opening) await (await opening).close();
}

export class LocalLineStore implements LineStore {
  async hasEntryForDate(employeeId: string, date: string) {
    const db = await openLocalDatabase(this.root);
    return (await db.query("select 1 from public.line_work_entries where employee_id=$1 and work_date=$2::date limit 1", [employeeId, date])).rows.length > 0;
  }
  async listEmployees() {
    const db = await openLocalDatabase(this.root);
    const result = await db.query<{ employee_id: string; name: string; active: boolean }>("select employee_id,name,active from public.ihd_employee_directory where active order by name");
    return result.rows.map((row) => ({ employeeId: row.employee_id, name: row.name, active: row.active }));
  }
  constructor(private root = localDataRoot()) {}
  private async rpc<T>(fn: string, values: unknown[]): Promise<T> {
    const db = await openLocalDatabase(this.root);
    const result = await db.query<{ value: T }>(`select public.${fn}(${values.map((_, index) => `$${index + 1}`).join(",")}) as value`,
      values.map((value) => value !== null && typeof value === "object" ? JSON.stringify(value) : value));
    return result.rows[0]?.value;
  }
  begin(event: LineEvent, lease: string) {
    return this.rpc<EventClaim>("line_begin_event", [event.webhookEventId, event.source.userId, event.timestamp, lease, event]);
  }
  async finish(event: LineEvent, lease: string, state: StoredConversation, entry: EmployeeWorkEntry | undefined, reply: IntakeReply) {
    await this.rpc("line_finish_event", [event.webhookEventId, event.source.userId, lease, state, entry ?? null, reply]);
  }
  async release(userId: string, lease: string) { await this.rpc("line_release_event", [userId, lease]); }
  async claimMedia(lease: string) { return this.rpc<boolean>("line_claim_media", [lease]); }
  async releaseMedia(lease: string) { await this.rpc("line_release_media", [lease]); }
  async replyStatus(eventId: string, status: "sent" | "rejected") {
    const db = await openLocalDatabase(this.root);
    await db.query("update public.line_events set reply_status=$1 where event_id=$2 and reply_status='pending'", [status, eventId]);
  }
  async snapshot(userId: string) {
    const db = await openLocalDatabase(this.root);
    const session = await db.query<{ state: StoredConversation }>("select state from public.line_sessions where user_id=$1", [userId]);
    const state = session.rows[0]?.state;
    const entries = await db.query<{ data: EmployeeWorkEntry }>("select data from public.line_work_entries where user_id=$1 order by created_at", [userId]);
    const replies = state ? await db.query<{ reply: IntakeReply }>("select reply from public.line_events where event_id=$1 and user_id=$2 and status='done'", [state.buttonContext, userId]) : null;
    return { state: state?.conversation ?? INITIAL_EMPLOYEE_INTAKE_STATE, entries: entries.rows.map((row) => row.data), reply: replies?.rows[0]?.reply ?? {
      text: "กดเพิ่มข้อมูลหน้างานเพื่อเริ่มบันทึกลงเครื่องครับ", buttons: [{ label: "เพิ่มข้อมูลหน้างาน", data: "intake:start" }]
    } };
  }
  async ownsImage(userId: string, reference: string) {
    const db = await openLocalDatabase(this.root);
    const result = await db.query(`select 1 from public.line_work_entries where user_id=$1 and data->>'imageId'=$2
      union all select 1 from public.line_sessions where user_id=$1 and state->'conversation'->'intake'->'draft'->>'imageId'=$2 limit 1`, [userId, reference]);
    return result.rows.length > 0;
  }
  async findEmployee(employeeId: string): Promise<IntakeEmployee | null> {
    const db = await openLocalDatabase(this.root);
    const result = await db.query<{ employee_id: string; name: string; active: boolean }>(
      "select employee_id,name,active from public.ihd_employee_directory where employee_id=$1", [employeeId]);
    const employee = result.rows[0];
    return employee ? { employeeId: employee.employee_id, name: employee.name, active: employee.active } : null;
  }
  async listEntries(userId: string, employeeId: string, month: string, offset: number): Promise<EntryPage> {
    const db = await openLocalDatabase(this.root);
    const rows = await db.query<{ data: EmployeeWorkEntry }>(`select data from public.line_work_entries
      where user_id=$1 and employee_id=$2 and to_char(work_date,'YYYY-MM')=$3
      order by work_date desc,created_at desc,id desc limit $4 offset $5`, [userId, employeeId, month, RECORD_PAGE_SIZE + 1, offset]);
    return { entries: rows.rows.slice(0, RECORD_PAGE_SIZE).map((row) => row.data), hasMore: rows.rows.length > RECORD_PAGE_SIZE };
  }
  async allEntries(month?: string) {
    const db = await openLocalDatabase(this.root);
    const result = await db.query<{ id: string; data: EmployeeWorkEntry }>(`select id,data from public.line_work_entries
      where ($1::text is null or to_char(work_date,'YYYY-MM')=$1) order by work_date desc,created_at desc limit 500`, [month ?? null]);
    return result.rows;
  }
  async savedImageExists(reference: string) {
    const db = await openLocalDatabase(this.root);
    return (await db.query("select 1 from public.line_work_entries where data->>'imageId'=$1 limit 1", [reference])).rows.length > 0;
  }
  async exportData() {
    const db = await openLocalDatabase(this.root);
    return db.transaction(async (tx) => {
      const tables: Record<string, unknown[]> = {};
      for (const table of ["ihd_employee_directory", "line_sessions", "line_events", "line_work_entries"]) {
        tables[table] = (await tx.query(`select * from public.${table}`)).rows;
      }
      return { version: 1, exportedAt: new Date().toISOString(), tables };
    });
  }
}
