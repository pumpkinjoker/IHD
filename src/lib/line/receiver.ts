import { randomUUID } from "node:crypto";
import {
  INITIAL_EMPLOYEE_INTAKE_STATE, transitionEmployeeIntake,
  type EmployeeLookup, type IntakeEmployee, type EmployeeIntakeResult
} from "./employee-intake";
import { bangkokDate, type IntakeReply } from "./intake";
import { LineMediaRejected, LineReplyRejected } from "./client";
import { eventToIntakeAction, type LineEvent } from "./webhook";
import type { LineStore } from "./store";
import type { DurableLineReceiver } from "./webhook-handler";
import { parseRecordCommand, parseRecordPostback, recordReply } from "./records";

export type ReceiverDependencies = {
  store: LineStore;
  employees: EmployeeLookup;
  line: {
    reply(token: string, reply: IntakeReply): Promise<void>;
    image(messageId: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  };
  archive: {
    saveEvidence(input: { messageId: string; workDate: string; employee: IntakeEmployee; bytes: Uint8Array; mimeType: string }): Promise<string>;
    placeEvidence(reference: string, employee: IntakeEmployee, date: string): Promise<void>;
  };
};

export function createLineReceiver(deps: ReceiverDependencies): DurableLineReceiver {
  async function deliver(event: LineEvent, reply: IntakeReply | null) {
    if (!reply || !event.replyToken) {
      await deps.store.replyStatus(event.webhookEventId, "rejected");
      return;
    }
    try {
      await deps.line.reply(event.replyToken, reply);
      await deps.store.replyStatus(event.webhookEventId, "sent");
    } catch (error) {
      if (error instanceof LineReplyRejected && error.status === 400) {
        // Reply tokens expire and can only be used once; never push a duplicate
        // confirmation as fallback. Preserve the saved data and terminal status.
        await deps.store.replyStatus(event.webhookEventId, "rejected");
        console.warn("LINE reply rejected; inspect server-only event delivery status");
      } else throw error;
    }
  }

  return {
    async receive(events) {
      for (const event of events) {
        if (event.source.type !== "user" || !event.source.userId) continue;
        let action = event.type === "follow" ? { type: "start" as const } : eventToIntakeAction(event);
        if (!action) continue;
        const lease = randomUUID();
        const claim = await deps.store.begin(event, lease);
        if (claim.kind === "busy") throw new Error("Conversation is processing another event");
        if (claim.kind === "ignored") continue;
        if (claim.kind === "duplicate") {
          if (claim.replyStatus === "pending") await deliver(event, claim.reply);
          continue;
        }
        let hasMediaLease = false;
        try {
          const current = claim.state?.conversation ?? INITIAL_EMPLOYEE_INTAKE_STATE;
          const now = new Date(event.timestamp);
          let staleButton = false;
          let recordRequest = action.type === "text" && current.employee &&
            ["idle", "review"].includes(current.intake.step) ? parseRecordCommand(action.text, bangkokDate(now).slice(0, 7)) : null;
          if (event.type === "postback" && event.postback) {
            const [data, context] = event.postback.data.split("|");
            recordRequest = parseRecordPostback(data);
            // Only an unscoped Start command is allowed from the permanent menu.
            staleButton = data !== "intake:start" && (!context || context !== claim.state?.buttonContext);
            action = eventToIntakeAction({ ...event, postback: { data } })!;
          }
          if (action.type === "text" && action.text.trim() === "เพิ่มข้อมูลหน้างาน" && current.onboarding === "idle" && current.intake.step === "idle") {
            action = { type: "start" };
          }
          const validPhotoStep = action.type === "image" && current.employee &&
            (current.intake.step === "idle" || current.intake.step === "photo");
          let mediaError: string | null = null;
          if (validPhotoStep && action.type === "image") {
            const active = await deps.employees(current.employee!.employeeId);
            if (active?.active) {
              hasMediaLease = await deps.store.claimMedia(lease);
              if (!hasMediaLease) throw new Error("Media archive is busy");
              try {
                const media = await deps.line.image(action.imageId);
                const reference = await deps.archive.saveEvidence({
                  messageId: action.imageId, workDate: current.intake.draft?.workDate ?? bangkokDate(now),
                  employee: active, ...media
                });
                if (!/^(drive:[A-Za-z0-9_-]+|(?:local|supabase):[a-f0-9]{64})$/.test(reference)) throw new Error("Evidence was not archived");
                action = { type: "image", imageId: reference };
              } catch (error) {
                if (error instanceof LineMediaRejected) mediaError = error.message;
                else throw error;
              }
            }
          }
          let result: EmployeeIntakeResult = mediaError ? {
            state: current, reply: { text: mediaError, buttons: [{ label: "ยกเลิก", data: "intake:cancel" }] }
          } : staleButton ? {
            state: current,
            reply: { text: "ปุ่มนี้เป็นของขั้นตอนก่อนหน้า กรุณาทำขั้นตอนปัจจุบันต่อ หรือยกเลิกเพื่อเริ่มใหม่ครับ",
              buttons: [{ label: "ยกเลิก", data: "intake:cancel" }] }
          } : recordRequest && current.employee ? {
            state: current,
            reply: recordReply(await deps.store.listEntries(event.source.userId, current.employee.employeeId, recordRequest.month, recordRequest.offset),
              recordRequest.month, recordRequest.offset, current.intake.step === "review")
          } : await transitionEmployeeIntake(current, action, now, deps.employees);
          if (result.entry) {
            hasMediaLease = hasMediaLease || await deps.store.claimMedia(lease);
            if (!hasMediaLease) throw new Error("Media archive is busy");
            if (await deps.store.hasEntryForDate(result.entry.employeeId, result.entry.workDate)) {
              result = { state: current, reply: { text: `วันที่ ${result.entry.workDate} มีรายการแล้วครับ บันทึกได้คนละหนึ่งงานต่อวัน`, buttons: [{ label: "เปลี่ยนวันที่", data: "intake:edit:date" }, { label: "ยกเลิก", data: "intake:cancel" }] } };
            } else await deps.archive.placeEvidence(result.entry.imageId, result.state.employee!, result.entry.workDate);
          }
          const buttons = [...result.reply.buttons];
          if (!recordRequest && result.state.employee && result.state.intake.step === "idle") buttons.push({ label: "ดูรายการ", data: `records:${bangkokDate(now).slice(0, 7)}:0` });
          const reply: IntakeReply = {
            ...result.reply,
            buttons: buttons.map((button) => ({ ...button, data: `${button.data}|${event.webhookEventId}` }))
          };
          // Entry creation, clearing the draft and recording the reply are atomic.
          await deps.store.finish(event, lease, { conversation: result.state, buttonContext: event.webhookEventId }, result.entry, reply);
          await deliver(event, reply);
        } catch (error) {
          await deps.store.release(event.source.userId, lease);
          throw error;
        } finally {
          if (hasMediaLease) await deps.store.releaseMedia(lease);
        }
      }
    }
  };
}
