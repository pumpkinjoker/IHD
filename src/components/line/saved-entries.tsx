"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { bangkokDate } from "@/lib/line/intake";
import type { EmployeeWorkEntry } from "@/lib/line/employee-intake";
import type { IntakeEmployee } from "@/lib/line/employee-intake";

type SavedEntry = { id: string; data: EmployeeWorkEntry };
function SavedEvidence({ data }: { data: EmployeeWorkEntry }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p className="flex h-40 items-center justify-center rounded bg-muted p-3 text-center text-sm">รูปไม่พร้อมแสดงหรือถูกลบเมื่อขึ้นเดือนที่ 3แล้ว</p> : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/line/records?image=${encodeURIComponent(data.imageId)}`} alt={`หลักฐาน ${data.subject}`} className="h-40 w-full rounded object-contain" onError={() => setFailed(true)} />
  );
}
export function SavedLineEntries({ cloudDatabase = false }: { cloudDatabase?: boolean }) {
  const [month, setMonth] = useState(() => bangkokDate(new Date()).slice(0, 7));
  const [employees, setEmployees] = useState<IntakeEmployee[]>([]);
  const [entries, setEntries] = useState<SavedEntry[]>([]);
  const [employee, setEmployee] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/line/records${month ? `?month=${encodeURIComponent(month)}` : ""}`, { cache: "no-store", signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error("อ่านข้อมูลไม่สำเร็จ");
      const result = await response.json() as { entries: SavedEntry[]; employees: IntakeEmployee[] };
      setEntries(result.entries); setEmployees(result.employees); setError(""); setLoading(false);
    }).catch((error: Error) => { if (!abort.signal.aborted) { setError(error.message); setLoading(false); } });
    return () => abort.abort();
  }, [month]);
  const visible = entries.filter(({ data }) => !employee || data.employeeId === employee);
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
    <Link href="/" className="text-sm underline">กลับหน้า IHD</Link>
    <h1 className="text-2xl font-semibold">รายการหน้างานที่บันทึกจาก LINE</h1>
    <p className="text-sm text-muted-foreground">{cloudDatabase ? "ข้อมูลจาก Supabase · " : ""}แสดงเฉพาะเดือน {month} · หนึ่งคน หนึ่งงานต่อวัน · รูปเดียวต่อรายการ</p>
    <div className="flex flex-wrap items-end gap-4">
      <label className="space-y-1 text-sm"><span className="block">เดือน</span><input aria-label="เดือน" className="rounded border p-2" type="month" required value={month} max={bangkokDate(new Date()).slice(0, 7)} onChange={(event) => { if (!event.target.value) return; setLoading(true); setMonth(event.target.value); }} /></label>
      <label className="space-y-1 text-sm"><span className="block">พนักงาน</span><select aria-label="พนักงาน" className="rounded border p-2" value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="">ทุกคน</option>{employees.map(({ employeeId: id, name }) => <option key={id} value={id}>{name} ({id}) — {entries.filter(({ data }) => data.employeeId === id).length} วัน</option>)}</select></label>
      <p className="text-sm">{visible.length} รายการ</p>
    </div>
    {loading ? <p role="status">กำลังอ่านรายการ...</p> : error ? <p role="alert">{error}</p> : !visible.length ? <p>ยังไม่มีรายการที่ยืนยันบันทึก</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(({ id, data }) => <article key={id} className="space-y-2 rounded-xl border bg-card p-3">
      <SavedEvidence key={data.imageId} data={data} />
      <p className="text-sm text-muted-foreground">{data.workDate}</p><h2 className="break-words font-semibold">{data.subject}</h2>
      <p className="break-words text-sm">สถานที่: {data.location}</p><p className="text-sm">{data.employeeName} ({data.employeeId})</p>
    </article>)}</div>}
  </main>;
}
