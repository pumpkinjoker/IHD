import { notFound } from "next/navigation";
import { LineIntakeSimulator } from "@/components/line/intake-simulator";
import { masterData } from "@/lib/master-data";
import Link from "next/link";

export default function LineSimulatorPage() {
  // This page has no authentication and must remain unavailable in production.
  if (process.env.NODE_ENV === "production") notFound();
  const employees = masterData.teams.flatMap((team) => team.members.map((member) => ({
    employeeId: member.employeeId, name: member.name, active: true
  })));
  return <>
    <LineIntakeSimulator employees={employees} />
    {process.env.LINE_STORAGE_MODE === "local" ? <p className="mx-auto max-w-5xl px-4 pb-8 text-sm"><Link className="underline" href="/line/local-test">ทดสอบแบบบันทึกข้อมูลและรูปลงเครื่องจริง</Link></p> : null}
  </>;
}
