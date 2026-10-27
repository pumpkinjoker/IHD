import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
let db: PGlite;
let period: string;
const lineId = "U" + "a".repeat(32);
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync("supabase/migrations/202610260001_line_intake.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/202610260002_employee_directory.sql", "utf8"));
  await db.exec("create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);");
  await db.exec(readFileSync("supabase/migrations/20261027035355_monthly_personal_reports.sql", "utf8"));
  period = (await db.query<{ period: string }>("select to_char(date_trunc('month',now() at time zone 'Asia/Bangkok')-interval '1 month','YYYY-MM-DD') as period")).rows[0].period;
}, 30_000);
beforeEach(async () => {
  await db.exec("truncate public.line_monthly_reports,public.line_work_entries,public.line_events,public.line_sessions,public.ihd_employee_directory;");
  await db.exec("insert into public.ihd_employee_directory values('12345678','คนแรก','one@example.com','Team','Staff',true),('87654321','คนที่สอง','two@example.com','Team','Staff',true);");
  await db.query("insert into public.line_sessions(user_id,state) values ($1,'{\"conversation\":{\"employee\":{\"employeeId\":\"12345678\"}}}')", [lineId]);
  await db.exec("insert into public.line_events(event_id,user_id,event_timestamp,payload) values ('one','user',1,'{}'),('two','user',2,'{}');");
  await db.query("insert into public.line_work_entries(id,user_id,employee_id,work_date,data) values ('one','user','12345678',$1::date,'{\"subject\":\"งานคนแรก\"}'),('two','user','87654321',$1::date,'{\"subject\":\"งานคนที่สอง\"}')", [period]);
});
afterAll(async () => { await db?.close(); });

it("freezes separate employee snapshots once and blocks recipients without a real LINE association", async () => {
  expect((await db.query<{ inserted: number }>("select public.line_prepare_monthly_reports($1::date) as inserted", [period])).rows[0].inserted).toBe(2);
  expect((await db.query<{ inserted: number }>("select public.line_prepare_monthly_reports($1::date) as inserted", [period])).rows[0].inserted).toBe(0);
  const rows = (await db.query<{ employee_id: string; line_user_id: string | null; status: string; snapshot: { entries: { data: { subject: string } }[] } }>("select * from public.line_monthly_reports order by employee_id")).rows;
  expect(rows[0].line_user_id).toBe(lineId);
  expect(rows[0].snapshot.entries.map((entry) => entry.data.subject)).toEqual(["งานคนแรก"]);
  expect(rows[1].status).toBe("blocked");
  expect(rows[1].line_user_id).toBeNull();
});
it("leases one report and rechecks employee association immediately before delivery", async () => {
  await db.query("select public.line_prepare_monthly_reports($1::date)", [period]);
  const job = (await db.query<{ job: { id: string } }>("select public.line_claim_monthly_report($1::date,'lease') as job", [period])).rows[0].job;
  expect((await db.query<{ job: unknown }>("select public.line_claim_monthly_report($1::date,'other') as job", [period])).rows[0].job).toBeNull();
  await db.query("update public.line_monthly_reports set report_url='https://example.test/report',push_text='frozen' where id=$1", [job.id]);
  await db.query("update public.line_sessions set state='{\"conversation\":{\"employee\":{\"employeeId\":\"87654321\"}}}' where user_id=$1", [lineId]);
  expect((await db.query<{ ready: boolean }>("select public.line_monthly_mark_attempt($1::uuid,'lease') as ready", [job.id])).rows[0].ready).toBe(false);
  expect((await db.query<{ status: string }>("select status from public.line_monthly_reports where id=$1", [job.id])).rows[0].status).toBe("blocked");
});
it("stops ambiguous retries before LINE's 24 hour retry window expires", async () => {
  await db.query("select public.line_prepare_monthly_reports($1::date)", [period]);
  await db.exec("update public.line_monthly_reports set first_attempt_at=now()-interval '24 hours' where status='pending';");
  expect((await db.query<{ job: unknown }>("select public.line_claim_monthly_report($1::date,'lease') as job", [period])).rows[0].job).toBeNull();
  expect((await db.query<{ status: string }>("select status from public.line_monthly_reports where employee_id='12345678'")).rows[0].status).toBe("ambiguous");
});
