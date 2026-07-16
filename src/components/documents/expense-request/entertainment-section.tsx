export function EntertainmentSection() {
  return (
    <section className="expense-entertainment-section">
      <p className="expense-entertainment-title">
        รายละเอียดค่ารับรอง (Detail of entertainment fee) - ระบุชื่อ นามสกุล
        และร้านค้า วัตถุประสงค์ของการเบิก
      </p>
      <table className="expense-entertainment-table">
        <thead>
          <tr>
            <th scope="col">
              ชื่อบุคคล/ชื่อเจ้าของร้าน (ที่ได้รับการรับรอง)
              <br />
              <span>(Entertain to)</span>
            </th>
            <th scope="col">ชื่อร้านค้า</th>
            <th scope="col">
              วัตถุประสงค์ของการเบิก
              <br />
              <span>(Business Purpose)</span>
            </th>
            <th scope="col">
              จำนวนเงิน
              <br />
              <span>(Amount)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td />
            <td />
            <td />
            <td />
          </tr>
          <tr>
            <td />
            <td />
            <td />
            <td />
          </tr>
        </tbody>
      </table>
    </section>
  );
}
