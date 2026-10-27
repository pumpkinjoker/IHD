import { expect, test } from "@playwright/test";
import masterData from "../../src/data/master-data.json";

// The simulator is deliberately unavailable in a production build.
// Run against a development server; see docs/line-intake-setup.md.
test("records one photo, subject, location and confirmation in the local simulator", async ({ page }) => {
  const response = await page.goto("/line/simulator");
  if (response?.status() === 404) {
    await expect(page.getByRole("heading", { name: "ทดลองบันทึกหน้างานผ่าน LINE" })).toHaveCount(0);
    test.skip(true, "Simulator is intentionally disabled in production; run against pnpm dev for the full flow.");
  }
  await page.getByRole("button", { name: "เพิ่มข้อมูลหน้างาน", exact: true }).click();
  const employee = masterData.teams[0].members[0];
  await expect(page.getByText("ใช้งานครั้งแรก กรุณาพิมพ์รหัสพนักงาน 8 หลักครับ", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "ข้อความถึงบอต" }).fill("00000000");
  await page.getByRole("button", { name: "ส่ง", exact: true }).click();
  await expect(page.getByText("ไม่พบรหัสพนักงานที่ใช้งานอยู่ กรุณาตรวจสอบรหัสแล้วลองใหม่ครับ", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "ข้อความถึงบอต" }).fill(employee.employeeId);
  await page.getByRole("button", { name: "ส่ง", exact: true }).click();
  await expect(page.getByText(new RegExp(`ชื่อ ${employee.name}`))).toBeVisible();
  await page.getByRole("button", { name: "ใช่ เป็นข้อมูลของฉัน", exact: true }).click();
  await page.getByLabel("ถ่ายหรือเลือกรูปหน้างาน 1 รูป").setInputFiles({
    name: "site.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64")
  });
  await expect(page.getByText("งานนี้หัวข้ออะไรครับ?", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "ข้อความถึงบอต" }).fill("ถ่ายทำหน้างาน");
  await page.getByRole("button", { name: "ส่ง", exact: true }).click();
  await expect(page.getByText("สถานที่ปฏิบัติงานที่ไหนครับ?", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "ข้อความถึงบอต" }).fill("บางนา");
  await page.getByRole("button", { name: "ส่ง", exact: true }).click();
  await expect(page.getByRole("heading", { name: "รายการที่ยืนยันในโหมดทดลอง (0)" })).toBeVisible();
  await page.getByRole("button", { name: "ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด", exact: true }).click();
  await expect(page.getByRole("heading", { name: "รายการที่ยืนยันในโหมดทดลอง (1)" })).toBeVisible();
  const entries = page.getByRole("region", { name: "รายการทดลอง" });
  await expect(entries.getByText("ถ่ายทำหน้างาน", { exact: true })).toBeVisible();
  await expect(entries.getByRole("img")).toHaveCount(1);
  await expect(entries.getByText(`ผู้ปฏิบัติงาน: ${employee.name} (${employee.employeeId})`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด", exact: true })).toHaveCount(0);
  // A linked employee sends the next photo directly, without pressing Start.
  await page.getByLabel("ถ่ายหรือเลือกรูปหน้างาน 1 รูป").setInputFiles({
    name: "second-site.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64")
  });
  await page.getByRole("textbox", { name: "ข้อความถึงบอต" }).fill("งานที่สอง");
  await page.getByRole("button", { name: "ส่ง", exact: true }).click();
  await page.getByRole("textbox", { name: "ข้อความถึงบอต" }).fill("พระราม 2");
  await page.getByRole("button", { name: "ส่ง", exact: true }).click();
  await page.getByRole("button", { name: "ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด", exact: true }).click();
  await expect(page.getByRole("heading", { name: "รายการที่ยืนยันในโหมดทดลอง (2)" })).toBeVisible();
  await expect(entries.getByText("งานที่สอง", { exact: true })).toBeVisible();
  await expect(entries.getByRole("img")).toHaveCount(2);
  // The original Start menu still works as well.
  await page.getByRole("button", { name: "เพิ่มข้อมูลหน้างาน", exact: true }).click();
  await expect(page.getByLabel("ถ่ายหรือเลือกรูปหน้างาน 1 รูป")).toBeVisible();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(entries.getByRole("img")).toHaveCount(2);
});
