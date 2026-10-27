import { test, expect } from "@playwright/test";
import masterData from "../../src/data/master-data.json";
import { createDefaultExpenseWorkItem } from "../../src/lib/expense-request/form-defaults";

test("opens monthly LINE records in the original form, edits, saves, reopens and previews", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-27T01:00:00Z"));
  const member = masterData.teams[0].members[0];
  let saved = { ...createDefaultExpenseWorkItem(), id: "line-event-1", workDate: "2026-10-26", subject: "งานจาก LINE", location: "สำนักงานใหญ่", evidenceImage: { fileName: "20261026.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=" } };
  let writes = 0;
  await page.route("**/api/expense-records**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.employeeId).toBe(member.employeeId);
      expect(body.month).toBe("2026-10");
      saved = body.item;
      writes++;
      return route.fulfill({ json: { saved: true } });
    }
    expect(new URL(route.request().url()).searchParams.get("employeeId")).toBe(member.employeeId);
    expect(new URL(route.request().url()).searchParams.has("month")).toBe(false);
    return route.fulfill({ json: { items: [saved], month: "2026-10" } });
  });
  await page.goto("/documents/expense-request/new");
  await page.getByLabel("ทีม", { exact: true }).click();
  await page.getByRole("option", { name: masterData.teams[0].name, exact: true }).click();
  await page.getByLabel("ผู้ขอเบิก", { exact: true }).click();
  await page.getByRole("option", { name: member.name, exact: true }).click();
  await expect(page.locator("input[type=month]")).toHaveCount(0);
  await page.getByRole("button", { name: "เปิดรายการที่บันทึกไว้" }).click();
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("งานจาก LINE");
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveAttribute("min", "2026-10-01");
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveAttribute("max", "2026-10-31");
  await expect(page.getByRole("button", { name: "เพิ่มรายการงาน" })).toBeDisabled();
  await page.getByLabel("หัวข้องาน", { exact: true }).fill("แก้หัวข้องานแล้ว");
  await page.getByLabel("ค่าเบี้ยเลี้ยง", { exact: true }).fill("400");
  await page.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("บันทึกแล้ว 1 รายการ");
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "เปลี่ยนผู้ขอเบิก" }).click();
  await page.getByRole("button", { name: "เปิดรายการที่บันทึกไว้" }).click();
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("แก้หัวข้องานแล้ว");
  await expect(page.getByLabel("ค่าเบี้ยเลี้ยง", { exact: true })).toHaveValue("400");
  await page.screenshot({ path: "test-results/expense-monthly-edit.png", fullPage: true });
  await page.getByRole("button", { name: "ยืนยันและดูตัวอย่าง", exact: true }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByText("แก้หัวข้องานแล้ว", { exact: true }).first()).toBeVisible();
});

test("shows a Thai error for an empty server response instead of a JSON parsing error", async ({ page }) => {
  await page.route("**/api/expense-records**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/documents/expense-request/new");
  await page.getByLabel("ทีม", { exact: true }).click();
  await page.getByRole("option", { name: masterData.teams[0].name, exact: true }).click();
  await page.getByLabel("ผู้ขอเบิก", { exact: true }).click();
  await page.getByRole("option", { name: masterData.teams[0].members[0].name, exact: true }).click();
  await page.getByRole("button", { name: "เปิดรายการที่บันทึกไว้" }).click();
  await expect(page.getByRole("status")).toContainText("ฐานข้อมูล");
  await expect(page.getByRole("status")).not.toContainText("JSON");
});
