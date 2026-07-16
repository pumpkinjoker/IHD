import { expect, test } from "@playwright/test";
import path from "node:path";
import masterData from "../../src/data/master-data.json";

test("creates and previews an expense request draft", async ({ page }) => {
  const requester = masterData.team[0];
  const approver = masterData.approvers.authorizedBy;
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto("/");
  await page.getByRole("link", { name: /เอกสารเบิกเงิน/ }).click();

  await expect(page).toHaveURL(/\/documents\/expense-request\/new$/);
  await expect(page.getByLabel("เวลาเริ่มต้น")).toHaveValue("08:00");
  await expect(page.getByLabel("เวลาสิ้นสุด")).toHaveValue("17:00");
  await expect(page.getByLabel("จำนวนกิโลเมตร")).toHaveValue("");
  await expect(page.getByLabel("ค่าเบี้ยเลี้ยง")).toHaveValue("300");
  await expect(page.getByRole("button", { name: "เพิ่มรายการงาน" })).toBeVisible();
  expect(
    await page.locator("form").evaluate((form) => {
      const workItemCard = Array.from(form.querySelectorAll("section")).find(
        (section) => section.textContent?.includes("รายการที่ 1")
      );
      const addButton = Array.from(form.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("เพิ่มรายการงาน")
      );

      return Boolean(
        workItemCard &&
          addButton &&
          workItemCard.compareDocumentPosition(addButton) &
            Node.DOCUMENT_POSITION_FOLLOWING
      );
    })
  ).toBe(true);
  await page.getByLabel("ผู้ขอเบิก").selectOption(requester.employeeId);
  await expect(page.getByText(requester.employeeId)).toBeVisible();
  await expect(page.getByText(requester.email)).toBeVisible();
  await expect(page.getByText(requester.position)).toBeVisible();
  await expect(page.getByText(requester.department)).toBeVisible();

  await page.getByLabel("วันที่เอกสาร").fill("2026-07-16");
  await page.getByLabel("วันที่ปฏิบัติงาน").fill("2026-07-16");
  await page.getByLabel("หัวข้องาน").fill("ถ่ายวิดีโอ");
  await page.getByLabel("เวลาเริ่มต้น").fill("08:00");
  await page.getByLabel("เวลาสิ้นสุด").fill("17:00");
  await page.getByLabel("สถานที่").fill("Marketing");
  await page.getByLabel("ค่าเบี้ยเลี้ยง").fill("1500");

  const evidenceImagePath = path.resolve("public/brand/toa-logo.png");
  const evidenceFileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "อัปโหลดรูป" }).click();
  await (await evidenceFileChooserPromise).setFiles(evidenceImagePath);
  await expect(page.getByText(/ไฟล์: toa-logo\.png/)).toBeVisible();

  await page.getByRole("button", { name: "ลบรูป" }).click();
  await expect(page.getByText(/ไฟล์: toa-logo\.png/)).toHaveCount(0);

  const evidenceDropTransfer = await page.evaluateHandle(async () => {
    const response = await fetch("/brand/toa-logo.png");
    const blob = await response.blob();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File([blob], "toa-logo.png", { type: "image/png" })
    );

    return dataTransfer;
  });

  await page
    .getByTestId("evidence-drop-zone")
    .dispatchEvent("drop", { dataTransfer: evidenceDropTransfer });
  await expect(page.getByText(/ไฟล์: toa-logo\.png/)).toBeVisible();

  await page.getByRole("button", { name: "ยืนยันและดูตัวอย่าง" }).click();

  await expect(page).toHaveURL(/\/documents\/expense-request\/preview$/);
  await expect(page.locator(".expense-request-page")).toHaveCount(2);
  await expect(page.locator(".expense-table tbody tr")).toHaveCount(17);
  await expect(page.locator(".expense-empty-row")).toHaveCount(16);
  expect(
    await page
      .locator(".expense-page-shell")
      .first()
      .locator(".expense-request-page")
      .evaluate(
        (pageElement) => pageElement.scrollHeight <= pageElement.clientHeight + 1
      )
  ).toBe(true);
  await expect(page.getByText("Page 1 · Expense Request")).toBeVisible();
  await expect(page.getByText("Page 2 · Supporting Evidence")).toBeVisible();
  await expect(page.getByRole("button", { name: "ย้อนกลับ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ดาวน์โหลด PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "พิมพ์เอกสาร" })).toBeVisible();
  await expect(page.getByRole("button", { name: "สร้างใหม่" })).toBeVisible();
  await expect(
    page.locator(".expense-page-shell").first().locator("img[alt='TOA logo']")
  ).toHaveCount(0);
  await expect(
    page.locator(".supporting-evidence-page img[alt='TOA logo']")
  ).toBeVisible();
  await expect(
    page.getByText("บันทึกเบี้ยเลี้ยง - การปฏิบัติงานนอกบริษัท")
  ).toBeVisible();
  await expect(
    page.getByText(`ผู้ปฏิบัติงาน: ${requester.name}`)
  ).toBeVisible();
  await expect(page.getByText(`ผู้อนุมัติ: ${approver.name}`)).toBeVisible();
  await expect(page.getByText("16 กรกฎาคม 2569")).toBeVisible();
  await expect(page.locator(".expense-purpose-cell")).toHaveCSS(
    "text-align",
    "left"
  );
  await expect(page.locator(".expense-purpose-cell")).toHaveCSS(
    "font-weight",
    "400"
  );
  await expect(page.locator(".expense-money-cell").first()).toHaveCSS(
    "text-align",
    "center"
  );
  await expect(
    page.locator(".expense-signature-section").getByText(requester.name)
  ).toBeVisible();
  await expect(
    page.locator(".expense-signature-section").getByText(approver.name)
  ).toBeVisible();
  await expect(
    page.locator(".expense-signature-section").getByText(approver.position)
  ).toBeVisible();
  await expect(page.getByText("ฝ่ายบัญชีทั่วไป")).toBeVisible();
  await expect(page.getByText("1,500.00").first()).toBeVisible();
  await expect(page.getByText("หนึ่งพันห้าร้อยบาทถ้วน")).toBeVisible();
  await expect(
    page.locator("img[alt='หลักฐานประกอบรายการที่ 1']")
  ).toBeVisible();
  expect(
    await page.locator(".expense-request-page *").evaluateAll((nodes) =>
      nodes.filter((node) => {
        if (node.closest(".supporting-evidence-page")) {
          return false;
        }

        const weight = window.getComputedStyle(node).fontWeight;

        return Number.parseInt(weight, 10) >= 600;
      }).length
    )
  ).toBe(0);

  await page.getByRole("button", { name: "ย้อนกลับ" }).click();

  await expect(page).toHaveURL(/\/documents\/expense-request\/new$/);
  await expect(page.getByLabel("ผู้ขอเบิก")).toHaveValue(requester.employeeId);
  await expect(page.getByLabel("วันที่เอกสาร")).toHaveValue("2026-07-16");
  await expect(page.getByLabel("หัวข้องาน")).toHaveValue("ถ่ายวิดีโอ");
  await expect(page.getByLabel("ค่าเบี้ยเลี้ยง")).toHaveValue("1500");
  await expect(page.getByText(/ไฟล์: toa-logo\.png/)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
