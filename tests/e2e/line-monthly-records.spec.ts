import { expect, test } from "@playwright/test";
import { bangkokDate } from "../../src/lib/line/intake";

test("shows only the selected month and includes employees with no records", async ({ page }) => {
  const month = bangkokDate(new Date()).slice(0, 7);
  const previous = new Date(`${month}-01T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const oldMonth = previous.toISOString().slice(0, 7);
  const employees = [{ employeeId: "11111111", name: "คนแรก", active: true }, { employeeId: "22222222", name: "คนที่สอง", active: true }];
  await page.route("**/api/line/records?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("image")) return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64") });
    const selected = url.searchParams.get("month");
    expect([month, oldMonth]).toContain(selected);
    await route.fulfill({ json: { employees, month: selected, entries: [{ id: "sample", data: { employeeId: "11111111", employeeName: "คนแรก", subject: selected === month ? "งานเดือนนี้" : "งานเดือนก่อน", workDate: `${selected}-01`, location: "สถานที่", imageId: "local:" + "a".repeat(64) } }] } });
  });
  const response = await page.goto("/line/records");
  test.skip(response?.status() === 404, "Records page is local-only");
  await expect(page.getByLabel("เดือน", { exact: true })).toHaveValue(month);
  await expect(page.getByRole("heading", { name: "งานเดือนนี้", exact: true })).toBeVisible();
  await page.getByLabel("พนักงาน", { exact: true }).selectOption("22222222");
  await expect(page.getByText("ยังไม่มีรายการที่ยืนยันบันทึก", { exact: true })).toBeVisible();
  await page.getByLabel("พนักงาน", { exact: true }).selectOption("11111111");
  await page.getByLabel("เดือน", { exact: true }).fill(oldMonth);
  await expect(page.getByRole("heading", { name: "งานเดือนก่อน", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "งานเดือนนี้", exact: true })).toHaveCount(0);
});
