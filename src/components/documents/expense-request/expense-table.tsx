import { calculateExpenseRowTotal } from "@/lib/calculations/expense";
import { formatShortThaiBuddhistDate } from "@/lib/dates/date-utils";
import { formatMoney } from "@/lib/money/format-money";
import type { ExpenseWorkItem } from "@/types/expense-request";
import { MoneySummary } from "./money-summary";

const MIN_VISIBLE_ROWS = 17;

type ExpenseTableProps = {
  workItems: ExpenseWorkItem[];
  grandTotal: string;
};

function amount(value: number | null) {
  return value ? formatMoney(value) : "";
}

function optionalNumber(value: number | null) {
  return value ? value : "";
}

export function ExpenseTable({ workItems, grandTotal }: ExpenseTableProps) {
  const visibleRows = Math.max(MIN_VISIBLE_ROWS, workItems.length);
  const rows = Array.from(
    { length: visibleRows },
    (_, index) => workItems[index]
  );

  return (
    <table className="expense-table">
      <colgroup>
        <col className="expense-col-date" />
        <col className="expense-col-items" />
        <col className="expense-col-from" />
        <col className="expense-col-to" />
        <col className="expense-col-km" />
        <col className="expense-col-fare" />
        <col className="expense-col-accommodation" />
        <col className="expense-col-per-diem" />
        <col className="expense-col-entertain" />
        <col className="expense-col-other" />
        <col className="expense-col-total" />
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2} scope="col">
            วัน/เดือน/ปี
            <br />
            <span>D/M/Y</span>
          </th>
          <th rowSpan={2} scope="col">
            รายการ / วัตถุประสงค์
            <br />
            <span>(Items)</span>
          </th>
          <th colSpan={2} scope="col">
            เส้นการเดินทาง (Place)
          </th>
          <th rowSpan={2} scope="col">
            จำนวน กม.
            <br />
            <span>(Total Kms.)</span>
          </th>
          <th rowSpan={2} scope="col">
            ค่าโดยสาร
            <br />
            <span>(Fare)</span>
          </th>
          <th rowSpan={2} scope="col">
            ค่าที่พัก
            <br />
            <span>(Accomodation)</span>
          </th>
          <th rowSpan={2} scope="col">
            ค่าเบี้ยเลี้ยง
            <br />
            <span>(Per diem)</span>
          </th>
          <th rowSpan={2} scope="col">
            **ค่ารับรอง
            <br />
            <span>(Entertain)</span>
          </th>
          <th rowSpan={2} scope="col">
            ค่าใช้จ่ายอื่น ๆ
            <br />
            <span>(Other exps.)</span>
          </th>
          <th rowSpan={2} scope="col">
            รวม
            <br />
            <span>(Total)</span>
          </th>
        </tr>
        <tr>
          <th scope="col">
            จาก
            <br />
            <span>From</span>
          </th>
          <th scope="col">
            ถึง
            <br />
            <span>To</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item, index) => {
          if (!item) {
            return (
              <tr className="expense-empty-row" key={`blank-${index}`}>
                {Array.from({ length: 11 }, (_, cellIndex) => (
                  <td key={cellIndex} />
                ))}
              </tr>
            );
          }

          return (
            <tr key={item.id}>
              <td>{formatShortThaiBuddhistDate(item.workDate)}</td>
              <td className="expense-purpose-cell">{item.subject}</td>
              <td>{item.travelFrom}</td>
              <td>{item.travelTo}</td>
              <td className="expense-number">
                {optionalNumber(item.totalKilometers)}
              </td>
              <td className="expense-money-cell">{amount(item.fare)}</td>
              <td className="expense-money-cell">{amount(item.accommodation)}</td>
              <td className="expense-money-cell">{amount(item.perDiem)}</td>
              <td className="expense-number">{amount(item.entertainment)}</td>
              <td className="expense-number">{amount(item.otherExpense)}</td>
              <td className="expense-money-cell">
                {formatMoney(calculateExpenseRowTotal(item))}
              </td>
            </tr>
          );
        })}
      </tbody>
      <MoneySummary grandTotal={grandTotal} />
    </table>
  );
}
