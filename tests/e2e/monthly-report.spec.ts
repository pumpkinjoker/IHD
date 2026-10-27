import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildMonthlyReport } from "../../supabase/functions/monthly-report-worker/index";
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
