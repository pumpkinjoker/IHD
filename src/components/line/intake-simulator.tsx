"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IntakeReply } from "@/lib/line/intake";
import {
  INITIAL_EMPLOYEE_INTAKE_STATE, parseEmployeeIntakePostback, transitionEmployeeIntake,
  type EmployeeIntakeAction, type EmployeeIntakeState, type EmployeeWorkEntry, type IntakeEmployee
} from "@/lib/line/employee-intake";

type ChatMessage = { author: "bot" | "user"; text: string };
const initialReply: IntakeReply = {
  text: "กดเพิ่มข้อมูลหน้างานเพื่อเริ่มทดลองครับ",
  buttons: [{ label: "เพิ่มข้อมูลหน้างาน", data: "intake:start" }]
};

type LocalSnapshot = { state: EmployeeIntakeState; reply: IntakeReply; entries: EmployeeWorkEntry[] };
const imageSource = (reference: string) => /^(local|supabase):/.test(reference) ? `/api/line/local-test?image=${encodeURIComponent(reference)}` : reference;

export function LineIntakeSimulator({ employees, localPersistence = false, cloudDatabase = false }: { employees: IntakeEmployee[]; localPersistence?: boolean; cloudDatabase?: boolean }) {
  const [state, setState] = useState<EmployeeIntakeState>(INITIAL_EMPLOYEE_INTAKE_STATE);
  const [reply, setReply] = useState(initialReply);
  const [messages, setMessages] = useState<ChatMessage[]>([{ author: "bot", text: initialReply.text }]);
  const [entries, setEntries] = useState<EmployeeWorkEntry[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(localPersistence);
  const [pending, setPending] = useState(false);
  const imageUrls = useRef<string[]>([]);
  const sending = useRef(false);

  useEffect(() => () => imageUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    if (!localPersistence) return;
    const abort = new AbortController();
    fetch("/api/line/local-test", { cache: "no-store", signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error("อ่านข้อมูลในเครื่องไม่สำเร็จ กรุณารีเฟรชเพื่อลองอีกครั้ง");
      const snapshot = await response.json() as LocalSnapshot;
      setState(snapshot.state);
      setReply(snapshot.reply);
      setEntries(snapshot.entries);
      setMessages([{ author: "bot", text: snapshot.reply.text }]);
      setImage(snapshot.state.intake.draft?.imageId ? imageSource(snapshot.state.intake.draft.imageId) : null);
      setLoading(false);
    }).catch((error: Error) => {
      if (!abort.signal.aborted) { setError(error.message); setLoading(false); }
    });
    return () => abort.abort();
  }, [localPersistence]);

  async function send(action: EmployeeIntakeAction, label: string, file?: File, postback?: string) {
    if (sending.current || loading) return;
    sending.current = true;
    setPending(true);
    if (localPersistence) {
      try {
        const form = new FormData();
        form.set("kind", postback ? "postback" : action.type);
        if (postback) form.set("data", postback);
        if (action.type === "text") form.set("text", action.text);
        if (file) form.set("file", file);
        const response = await fetch("/api/line/local-test", { method: "POST", body: form });
        const snapshot = await response.json() as LocalSnapshot & { error?: string };
        if (!response.ok) throw new Error(snapshot.error || "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
        setState(snapshot.state);
        setReply(snapshot.reply);
        setEntries(snapshot.entries);
        setImage(snapshot.state.intake.draft?.imageId ? imageSource(snapshot.state.intake.draft.imageId) : null);
        setMessages((items) => [...items, { author: "user", text: label }, { author: "bot", text: snapshot.reply.text }]);
        setError("");
      } catch (error) { setError(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ"); }
      finally { sending.current = false; setPending(false); }
      return;
    }
    let result;
    try {
      result = await transitionEmployeeIntake(state, action, new Date(),
        (employeeId) => employees.find((employee) => employee.employeeId === employeeId) ?? null);
    } catch {
      setError("ค้นหาข้อมูลพนักงานไม่สำเร็จ กรุณาลองอีกครั้งครับ");
      sending.current = false;
      setPending(false);
      return;
    }
    const nextReply = result.entry ? { ...result.reply, text: "บันทึกในโหมดทดลองแล้ว — ยังไม่ส่งเข้า Drive หรือเอกสารจริง\nครั้งต่อไปส่งรูปเพื่อเริ่มรายการใหม่ได้เลยครับ" } : result.reply;
    setState(result.state);
    setReply(nextReply);
    setMessages((items) => [...items, { author: "user", text: label }, { author: "bot", text: nextReply.text }]);
    if (result.entry) setEntries((items) => [...items, result.entry!]);
    if (result.state.intake.step === "idle") setImage(null);
    setError("");
    sending.current = false;
    setPending(false);
  }

  function submitText(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || sending.current || loading) return;
    send({ type: "text", text }, text);
    setText("");
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-6 px-4 py-8">
      <Link className="text-sm underline" href="/">กลับหน้า IHD</Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{localPersistence ? cloudDatabase ? "ทดสอบ LINE กับ Supabase" : "ทดสอบ LINE พร้อมบันทึกลงเครื่อง" : "ทดลองบันทึกหน้างานผ่าน LINE"}</h1>
        <p className="text-sm text-muted-foreground">{localPersistence ? `${cloudDatabase ? "เก็บข้อมูลใน Supabase และรูปในเครื่องนี้" : "เก็บข้อมูลและรูปในเครื่องนี้"} · รีเฟรชแล้วรายการยังอยู่ · ไม่ส่งเข้า LINE, Drive หรืออีเมล` : "โหมดทดลองบนเครื่อง · ข้อมูลอยู่ในหน้านี้เท่านั้น รีเฟรชแล้วหาย · ไม่ส่งเข้า LINE, Drive หรืออีเมล"}</p>
        {loading ? <p role="status" className="text-sm">กำลังอ่านข้อมูลในเครื่อง...</p> : null}
        <p className="text-sm">{state.employee ? `กำลังบันทึกในชื่อ ${state.employee.name} (${state.employee.employeeId})` : "ครั้งแรกกรอกรหัสพนักงาน แล้วเลือกชื่อของตัวเอง ไม่ต้องใช้ OTP"}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-4 rounded-xl border bg-card p-4" aria-label="แชตทดลอง">
          <div className="max-h-96 space-y-3 overflow-y-auto" role="log" aria-label="ประวัติแชต" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={`whitespace-pre-wrap break-words rounded-lg p-3 text-sm ${message.author === "bot" ? "mr-6 bg-secondary" : "ml-6 bg-primary text-primary-foreground"}`}>
                <span className="mb-1 block text-xs opacity-70">{message.author === "bot" ? "IHD" : "คุณ"}</span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          {image && state.intake.draft?.imageId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="รูปหน้างานที่เลือก" className="max-h-56 w-full rounded-lg object-contain" />
          ) : null}
          <div className="flex flex-wrap gap-2" aria-label="เมนูแชต">
            {reply.buttons.map((button) => (
              <Button key={button.data} size="sm" variant="outline" disabled={loading || pending} onClick={() => send(parseEmployeeIntakePostback(button.data), button.label, undefined, button.data)}>{button.label}</Button>
            ))}
          </div>
          {state.intake.step === "photo" || (state.employee && state.intake.step === "idle") ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="intake-photo">ถ่ายหรือเลือกรูปหน้างาน 1 รูป</label>
              <Input id="intake-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={pending || loading} onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
                  setError("เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 8 MB ครับ"); return;
                }
                if (localPersistence) {
                  send({ type: "image", imageId: "pending-upload" }, `ส่งรูป: ${file.name}`, file);
                  return;
                }
                const url = URL.createObjectURL(file);
                imageUrls.current.push(url);
                setImage(url);
                send({ type: "image", imageId: url }, `ส่งรูป: ${file.name}`);
              }} />
            </div>
          ) : null}
          <form className="flex gap-2" onSubmit={submitText}>
            <Input aria-label="ข้อความถึงบอต" placeholder="พิมพ์ข้อความตอบบอต" maxLength={300} disabled={pending || loading} value={text} onChange={(event) => setText(event.target.value)} />
            <Button type="submit" disabled={!text.trim() || loading || pending}>ส่ง</Button>
          </form>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </section>
        <section className="space-y-3" aria-label="รายการทดลอง">
          <h2 className="font-semibold">{localPersistence ? cloudDatabase ? "รายการที่บันทึกใน Supabase" : "รายการที่บันทึกลงเครื่อง" : "รายการที่ยืนยันในโหมดทดลอง"} ({entries.length})</h2>
          {!entries.length ? <p className="text-sm text-muted-foreground">รายการจะแสดงหลังจากกดยืนยันบันทึก</p> : null}
          {entries.map((entry, index) => (
            <article key={index} className="space-y-2 rounded-lg border p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSource(entry.imageId)} alt={`หลักฐานรายการที่ ${index + 1}`} className="h-28 w-full object-contain" />
              <p className="text-sm">วันที่: {entry.workDate}</p>
              <p className="text-sm">ผู้ปฏิบัติงาน: {entry.employeeName} ({entry.employeeId})</p>
              <p className="break-words font-medium">{entry.subject}</p>
              <p className="break-words text-sm">สถานที่: {entry.location}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
