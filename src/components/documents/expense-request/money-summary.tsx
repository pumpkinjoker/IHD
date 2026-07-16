type MoneySummaryProps = {
  grandTotal: string;
};

export function MoneySummary({ grandTotal }: MoneySummaryProps) {
  return (
    <tfoot>
      <tr className="expense-total-row">
        <th colSpan={2} scope="row">
          รวมค่าใช้จ่าย
        </th>
        <td />
        <td />
        <td />
        <td />
        <td />
        <td />
        <td />
        <td />
        <td className="expense-money-cell">{grandTotal}</td>
      </tr>
    </tfoot>
  );
}
