import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
let cutoff: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync("supabase/migrations/202610260001_line_intake.sql", "utf8"));
  await db.exec("create table public.line_evidence_files(reference text primary key,work_date date);");
  await db.exec(readFileSync("supabase/migrations/20261027033503_purge_expired_work_data.sql", "utf8"));
  cutoff = (await db.query<{ cutoff: string }>("select to_char(date_trunc('month',now() at time zone 'Asia/Bangkok')-interval '1 month','YYYY-MM-DD') as cutoff")).rows[0].cutoff;
}, 30_000);
beforeEach(async () => {
  await db.exec("truncate public.line_work_entries,public.line_events,public.line_sessions,public.line_evidence_files; update public.line_media_lock set lease_token=null,lease_until=null;");
  await db.query("insert into public.line_events(event_id,user_id,event_timestamp,payload,status,created_at) values ('expired','user',1,'{}','done',now()),('current','user',2,'{}','done',now()),('old-chat','user',0,'{\"message\":\"old text\"}','done',$1::date-interval '1 day')", [cutoff]);
  await db.query("insert into public.line_work_entries(id,user_id,employee_id,work_date,data) values ('expired','user','12345678',$1::date-1,'{\"imageId\":\"supabase:old\",\"subject\":\"old work\"}'),('current','user','12345678',$1::date,'{\"imageId\":\"supabase:current\",\"subject\":\"keep\"}')", [cutoff]);
  await db.query("insert into public.line_evidence_files values ('supabase:old',$1::date-1),('supabase:current',$1::date)", [cutoff]);
  await db.query("insert into public.line_sessions(user_id,state) values ('user',jsonb_build_object('conversation',jsonb_build_object('employee',jsonb_build_object('employeeId','12345678'),'intake',jsonb_build_object('step','review','draft',jsonb_build_object('workDate',to_char($1::date-1,'YYYY-MM-DD'),'subject','expired draft'))),'buttonContext','expired'))", [cutoff]);
});
afterAll(async () => { await db?.close(); });

it("deletes expired work, image registry and chat data while preserving current data and LINE registration", async () => {
  await db.query("select public.line_claim_media('cleanup-test')");
  const result = await db.query<{ result: { entries: number; events: number; images: number } }>("select public.line_purge_expired_data($1::date,$2::text[],'cleanup-test') as result", [cutoff, ["supabase:old"]]);
  expect(result.rows[0].result).toEqual({ entries: 1, events: 2, images: 1 });
  expect((await db.query("select id from public.line_work_entries")).rows).toEqual([{ id: "current" }]);
  expect((await db.query("select reference from public.line_evidence_files")).rows).toEqual([{ reference: "supabase:current" }]);
  const { state } = (await db.query<{ state: { conversation: { employee: { employeeId: string }; intake: { step: string; draft: null } } } }>("select state from public.line_sessions")).rows[0];
  expect(state.conversation.employee.employeeId).toBe("12345678");
  expect(state.conversation.intake).toEqual({ step: "idle", draft: null });
});
it("requires a live media lease and refuses an arbitrary future cutoff", async () => {
  await expect(db.query("select public.line_purge_expired_data($1::date,$2::text[],'missing')", [cutoff, ["supabase:old"]])).rejects.toThrow("Media lease lost");
  await db.query("select public.line_claim_media('cleanup-test')");
  await expect(db.query("select public.line_purge_expired_data('2099-01-01',$1::text[],'cleanup-test')", [["supabase:old"]])).rejects.toThrow("Invalid retention cutoff");
  expect((await db.query("select id from public.line_work_entries")).rows).toHaveLength(2);
});
