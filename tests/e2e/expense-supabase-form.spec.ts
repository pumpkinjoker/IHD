import { test, expect } from "@playwright/test";
import masterData from "../../src/data/master-data.json";
import { createDefaultExpenseWorkItem } from "../../src/lib/expense-request/form-defaults";

test("adds, edits and deletes loaded records", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-27T02:00:00Z"));
  const member = masterData.teams[0].members[0];
  let rows = [{ ...createDefaultExpenseWorkItem(), id: "original", workDate: "2026-10-26", subject: "original", evidenceExpired: true }];
  let creates = 0, deletes = 0;
  await page.route("**/api/expense-records**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { employeeId: member.employeeId, month: "2026-10", items: rows } });
    const body = route.request().postDataJSON();
    if (route.request().method() === "DELETE") {
      rows = rows.filter(row => row.id !== body.id); deletes++;
      return route.fulfill({ json: { deleted: true } });
    }
    const item = { ...body.item, isNew: false };
    if (body.operation === "create") { item.id = "created"; rows.push(item); creates++; }
    else rows = rows.map(row => row.id === item.id ? item : row);
    return route.fulfill({ json: { saved: true, id: item.id } });
  });
  await page.goto("/documents/expense-request/new");
  await page.getByLabel("ทีม", { exact: true }).click();
  await page.getByRole("option", { name: masterData.teams[0].name, exact: true }).click();
  await page.getByLabel("ผู้ขอเบิก", { exact: true }).click();
  await page.getByRole("option", { name: member.name, exact: true }).click();
  await page.getByRole("button", { name: "เปิดรายการที่บันทึกไว้" }).click();
  await page.getByLabel("หัวข้องาน", { exact: true }).fill("edited");
  await page.getByRole("button", { name: "เพิ่มรายการงาน", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("document-generator:expense-request:draft") || "null")?.data.workItems.length)).toBe(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "บันทึกการแก้ไข", exact: true })).toBeVisible();
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveCount(2);
  await page.getByLabel("วันที่ปฏิบัติงาน", { exact: true }).nth(1).fill("2026-10-25");
  await page.getByLabel("หัวข้องาน", { exact: true }).nth(1).fill("new");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "อัปโหลดรูป", exact: true }).nth(1).click();
  await (await chooser).setFiles("public/brand/toa-logo.png");
  await expect(page.getByText(/ไฟล์: toa-logo/)).toBeVisible();
  await page.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("บันทึกแล้ว 2 รายการ");
  expect(creates).toBe(1);
  expect(rows[0].subject).toBe("edited");
  await page.getByRole("button", { name: "ลบรายการที่ 1", exact: true }).click();
  expect(deletes).toBe(0);
  await page.getByRole("button", { name: "ยืนยันลบรายการ", exact: true }).click();
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("new");
  expect(deletes).toBe(1);
  await page.reload();
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("new");
  await page.getByRole("button", { name: "บันทึกการแก้ไข", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("บันทึกแล้ว 1 รายการ");
  expect(creates).toBe(1);
});

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
    expect(new URL(route.request().url()).searchParams.get("month")).toBe("2026-10");
    return route.fulfill({ json: { items: [saved], month: "2026-10" } });
  });
  await page.goto("/documents/expense-request/new");
  await page.getByLabel("ทีม", { exact: true }).click();
  await page.getByRole("option", { name: masterData.teams[0].name, exact: true }).click();
  await page.getByLabel("ผู้ขอเบิก", { exact: true }).click();
  await page.getByRole("option", { name: member.name, exact: true }).click();
  await expect(page.getByLabel("เดือนที่ต้องการทำข้อมูล")).toHaveValue("2026-10");
  await page.getByRole("button", { name: "เปิดรายการที่บันทึกไว้" }).click();
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("งานจาก LINE");
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveAttribute("min", "2026-10-01");
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveAttribute("max", "2026-10-31");
  await expect(page.getByRole("button", { name: "เพิ่มรายการงาน" })).toBeEnabled();
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

test("loads the previous month summary and keeps its month when reopening the form", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T02:00:00Z"));
  const member = masterData.teams[0].members[0];
  const item = { ...createDefaultExpenseWorkItem(), id: "last-month-entry", workDate: "2026-10-26", subject: "สรุปเดือนก่อน", location: "สำนักงานใหญ่", fare: 200, evidenceExpired: true };
  await page.route("**/api/expense-records**", async route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().month).toBe("2026-10");
      return route.fulfill({ json: { saved: true } });
    }
    expect(new URL(route.request().url()).searchParams.get("month")).toBe("2026-10");
    return route.fulfill({ json: { employeeId: member.employeeId, month: "2026-10", items: [item] } });
  });
  await page.goto("/documents/expense-request/new");
  await page.getByLabel("ทีม", { exact: true }).click();
  await page.getByRole("option", { name: masterData.teams[0].name, exact: true }).click();
  await page.getByLabel("ผู้ขอเบิก", { exact: true }).click();
  await page.getByRole("option", { name: member.name, exact: true }).click();
  await page.getByRole("button", { name: "ดึงข้อมูลสรุปเดือนที่แล้ว" }).click();
  await expect(page.getByText("รายการเดือนตุลาคม 2569", { exact: true })).toBeVisible();
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveValue("2026-10-26");
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveAttribute("min", "2026-10-01");
  await expect(page.getByText("500.00", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveValue("2026-10-26");
  await expect(page.getByText("รายการเดือนตุลาคม 2569", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ยืนยันและดูตัวอย่าง", exact: true }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByText("สรุปเดือนก่อน", { exact: true }).first()).toBeVisible();
});


test("selects a work month, protects unfinished data, and restores that month", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T02:00:00Z"));
  const member = masterData.teams[0].members[0];
  let reads = 0;
  await page.route("**/api/expense-records**", async route => {
    reads++;
    expect(new URL(route.request().url()).searchParams.get("month")).toBe("2026-10");
    return route.fulfill({ json: { employeeId: member.employeeId, month: "2026-10", items: [{ ...createDefaultExpenseWorkItem(), id: "selected-month", workDate: "2026-10-26", subject: "งานเดือนที่เลือก", evidenceExpired: true }] } });
  });
  await page.goto("/documents/expense-request/new");
  await page.getByLabel("ทีม", { exact: true }).click();
  await page.getByRole("option", { name: masterData.teams[0].name, exact: true }).click();
  await page.getByLabel("ผู้ขอเบิก", { exact: true }).click();
  await page.getByRole("option", { name: member.name, exact: true }).click();
  await page.getByLabel("เดือนที่ต้องการทำข้อมูล").fill("2026-10");
  await expect(page.getByLabel("วันที่ปฏิบัติงาน", { exact: true })).toHaveAttribute("max", "2026-10-31");
  await page.getByRole("button", { name: "เปิดรายการที่บันทึกไว้" }).click();
  expect(reads).toBe(1);
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("งานเดือนที่เลือก");
  await page.getByLabel("เดือนที่ต้องการทำข้อมูล").fill("2026-09");
  await page.getByRole("button", { name: "กรอกเดือนเดิมต่อ" }).click();
  await expect(page.getByLabel("เดือนที่ต้องการทำข้อมูล")).toHaveValue("2026-10");
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("งานเดือนที่เลือก");
  await page.getByLabel("เดือนที่ต้องการทำข้อมูล").fill("2026-09");
  await page.getByRole("button", { name: "เปลี่ยนเดือนและเริ่มรายการใหม่" }).click();
  await expect(page.getByLabel("เดือนที่ต้องการทำข้อมูล")).toHaveValue("2026-09");
  await expect(page.getByLabel("หัวข้องาน", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "เปิดรายการที่บันทึกไว้" })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("เดือนที่ต้องการทำข้อมูล")).toHaveValue("2026-09");
  await page.getByLabel("วันที่เอกสาร").fill("2026-11-02");
  await page.getByLabel("วันที่ปฏิบัติงาน", { exact: true }).fill("2026-09-15");
  await page.getByLabel("หัวข้องาน", { exact: true }).fill("เอกสารย้อนหลัง");
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "อัปโหลดรูป" }).click();
  await (await fileChooser).setFiles("public/brand/toa-logo.png");
  await expect(page.getByText(/ไฟล์: toa-logo/)).toBeVisible();
  await page.getByRole("button", { name: "ยืนยันและดูตัวอย่าง", exact: true }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByText("เอกสารย้อนหลัง", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/selected-work-month-preview.png" });
});
