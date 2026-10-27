import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildMonthlyReport } from "../../supabase/functions/monthly-report-worker/index";
import masterData from "../../src/data/master-data.json";
import { createDefaultExpenseWorkItem } from "../../src/lib/expense-request/form-defaults";
const origin = "https://pqyvtdvskovhbsjduskr.supabase.co";
const summaryUrl = `${origin}/storage/v1/object/sign/ihd-monthly-reports/test/summary.json?token=sample`;
const imageUrl = `${origin}/storage/v1/object/sign/ihd-evidence-test/test/photo.png?token=sample`;
const png = readFileSync("public/brand/toa-logo.png");

test("opens a personal monthly summary and prints the existing form with all evidence", async ({ page }) => {
  const entries = Array.from({ length: 31 }, (_, index) => ({ id: `row-${index}`, data: { workDate: `2026-10-${String(index+1).padStart(2,"0")}`, subject: `งานตัวอย่างวันที่ ${index+1}`, location: "สถานที่ตัวอย่าง", imageId: "supabase:" + "a".repeat(64) } }));
  const report = buildMonthlyReport({ id: "sample", period: "2026-10-01", employee_id: "00000000", line_user_id: "unused", snapshot: { employee: { employee_id: "00000000", name: "พนักงาน ตัวอย่าง", email: "example@example.com", position: "พนักงาน", team: "ทีมตัวอย่าง" }, entries }, report_url: null, push_text: null, retry_key: "unused", expires_at: "2030-01-01T00:00:00Z" }, entries.map(() => ({ fileName: "photo.png", mimeType: "image/png", dataUrl: imageUrl })));
  await page.route(`${origin}/storage/v1/object/sign/**`, (route) => route.request().url().includes("summary.json") ? route.fulfill({ json: { ...report, preview: true } }) : route.fulfill({ contentType: "image/png", body: png }));
  await page.route(`${origin}/functions/v1/resolve-report-link`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ token: "a".repeat(22) });
    await route.fulfill({ json: { url: summaryUrl } });
  });
  await page.goto(`/s#${"a".repeat(22)}`);
  await expect(page.locator(".expense-document-stack")).toBeVisible();
  await expect(page.getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "พิมพ์เอกสาร", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "แก้ไขเอกสาร", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("สรุปยอดเบิกค่าใช้จ่ายเดือนตุลาคม 2569");
  await expect(page.getByText(/สรุปช่วงทดสอบ ณ ตอนเรียกดู/)).toHaveCount(0);
  await expect(page.getByText("31 วัน · รวม 9,300.00 บาท")).toHaveCount(0);
  await expect(page.locator("img[alt^='หลักฐานประกอบรายการที่']")).toHaveCount(31);
  await expect.poll(() => page.locator(".expense-document-stack img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: "test-results/monthly-report-preview-screen.png" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "test-results/monthly-summary-sample.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
  await page.screenshot({ path: "test-results/monthly-summary-sample.png", fullPage: true });
});
test("rejects a link to an unrelated website", async ({ page }) => {
  await page.goto("/line/monthly#https%3A%2F%2Fother.example%2Freport.json");
  await expect(page.getByRole("alert").filter({ hasText: "ลิงก์รายงานไม่ถูกต้อง" })).toBeVisible();
});

test("edits the linked employee's previous-month document using current database records", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-01T01:00:00Z"));
  const member = masterData.teams[0].members[0], token = "b".repeat(22);
  let saved = { ...createDefaultExpenseWorkItem(), id: "report-entry", workDate: "2026-10-07", subject: "ข้อมูลล่าสุดจากฐานข้อมูล", location: "สำนักงานใหญ่", accommodation: 500, evidenceImage: { fileName: "20261007.png", mimeType: "image/png", dataUrl: `data:image/png;base64,${png.toString("base64")}` } };
  let writes = 0;
  const employee = { employee_id: member.employeeId, name: member.name, email: member.email, team: masterData.teams[0].key, position: member.position };
  const report = buildMonthlyReport({ id: "sample", period: "2026-10-01", employee_id: member.employeeId, line_user_id: "unused", snapshot: { employee, entries: [{ id: saved.id, data: { workDate: saved.workDate, subject: "ข้อมูล ณ ปิดเดือน", location: saved.location, imageId: "unused" } }] }, report_url: null, push_text: null, retry_key: "unused", expires_at: "2030-01-01T00:00:00Z" }, [{ fileName: "photo.png", mimeType: "image/png", dataUrl: imageUrl }]);
  await page.route(`${origin}/functions/v1/resolve-report-link`, (route) => route.fulfill({ json: { url: summaryUrl } }));
  await page.route(`${origin}/storage/v1/object/sign/**`, (route) => route.request().url().includes("summary.json") ? route.fulfill({ json: report }) : route.fulfill({ contentType: "image/png", body: png }));
  await page.route("**/api/expense-records**", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ employeeId: member.employeeId, month: "2026-10", reportToken: token });
      saved = body.item; writes++;
      return route.fulfill({ json: { saved: true } });
    }
    expect(route.request().headers()["x-report-token"]).toBe(token);
    return route.fulfill({ json: { employeeId: member.employeeId, month: "2026-10", items: [saved] } });
  });
  await page.goto(`/s#${token}`);
  await page.getByRole("button", { name: "แก้ไขเอกสาร", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/documents/expense-request/new#report=${token}$`));
  await expect(page.getByLabel("ผู้ขอเบิก", { exact: true })).toContainText(member.name);
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("ข้อมูลล่าสุดจากฐานข้อมูล");
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveAttribute("max", "2026-10-31");
  await expect(page.locator("input[type=month]")).toHaveCount(0);
  await page.getByLabel("ค่าที่พัก", { exact: true }).fill("1200");
  await page.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("บันทึกแล้ว 1 รายการ");
  expect(writes).toBe(1);
  await page.reload();
  await expect(page.getByLabel("ค่าที่พัก", { exact: true })).toHaveValue("1200");
  await page.screenshot({ path: "test-results/linked-report-edit-form.png" });
  await page.getByRole("button", { name: "ยืนยันและดูตัวอย่าง", exact: true }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByText("ข้อมูลล่าสุดจากฐานข้อมูล", { exact: true }).first()).toBeVisible();
});
