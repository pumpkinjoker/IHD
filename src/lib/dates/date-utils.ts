export function isIsoDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getIsoDateParts(value: string) {
  if (!isIsoDateString(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  return { year, month, day };
}

export function formatShortThaiBuddhistDate(value: string) {
  const parts = getIsoDateParts(value);

  if (!parts) {
    return "";
  }

  const buddhistYear = parts.year + 543;
  const shortYear = String(buddhistYear).slice(-2);
  const day = String(parts.day).padStart(2, "0");
  const month = String(parts.month).padStart(2, "0");

  return `${day}/${month}/${shortYear}`;
}

const thaiMonthNames = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม"
];

export function formatLongThaiBuddhistDate(value: string) {
  const parts = getIsoDateParts(value);

  if (!parts) {
    return "";
  }

  return `${parts.day} ${thaiMonthNames[parts.month - 1]} ${parts.year + 543}`;
}

export function isValidTimeRange(startTime: string, endTime: string) {
  if (!startTime || !endTime) {
    return true;
  }

  return startTime <= endTime;
}

export function formatTimeRange(startTime: string, endTime: string) {
  if (!startTime && !endTime) {
    return "-";
  }

  if (!startTime || !endTime) {
    return startTime || endTime;
  }

  return `${startTime} - ${endTime}`;
}
