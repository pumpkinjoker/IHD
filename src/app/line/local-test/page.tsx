import { notFound } from "next/navigation";
import Link from "next/link";
import { LineIntakeSimulator } from "@/components/line/intake-simulator";
import { masterData } from "@/lib/master-data";
import { lineStorageModes } from "@/lib/line/storage-config";

export default function LocalIntakePage() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL || !["local", "supabase"].includes(lineStorageModes().media)) notFound();
  const employees = masterData.teams.flatMap((team) => team.members.map((employee) => ({ employeeId: employee.employeeId, name: employee.name, active: true })));
  return <>
    <LineIntakeSimulator employees={employees} localPersistence cloudDatabase={lineStorageModes().database === "supabase"} />
    <p className="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 pb-8 text-sm"><Link className="underline" href="/line/records">ดูรายการที่บันทึกจาก LINE</Link><Link className="underline" href="/line/simulator">กลับไปโหมดจำลองที่ไม่บันทึกข้อมูล</Link></p>
  </>;
}
