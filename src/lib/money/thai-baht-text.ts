const thaiDigits = [
  "ศูนย์",
  "หนึ่ง",
  "สอง",
  "สาม",
  "สี่",
  "ห้า",
  "หก",
  "เจ็ด",
  "แปด",
  "เก้า"
];

const thaiPositions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readSixDigitGroup(value: number) {
  if (value === 0) {
    return "";
  }

  const digits = String(value).split("").map(Number);
  const length = digits.length;

  return digits
    .map((digit, index) => {
      if (digit === 0) {
        return "";
      }

      const position = length - index - 1;

      if (position === 0 && digit === 1 && length > 1) {
        return "เอ็ด";
      }

      if (position === 1 && digit === 1) {
        return "สิบ";
      }

      if (position === 1 && digit === 2) {
        return "ยี่สิบ";
      }

      return `${thaiDigits[digit]}${thaiPositions[position]}`;
    })
    .join("");
}

function readInteger(value: number): string {
  if (value === 0) {
    return thaiDigits[0];
  }

  const groups: number[] = [];
  let remaining = value;

  while (remaining > 0) {
    groups.unshift(remaining % 1_000_000);
    remaining = Math.floor(remaining / 1_000_000);
  }

  return groups
    .map((group, index) => {
      const text = readSixDigitGroup(group);
      const millionSuffixCount = groups.length - index - 1;

      if (!text) {
        return "";
      }

      return `${text}${"ล้าน".repeat(millionSuffixCount)}`;
    })
    .join("");
}

export function toThaiBahtText(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Amount must be a non-negative finite number.");
  }

  const roundedSatang = Math.round(value * 100);
  const baht = Math.floor(roundedSatang / 100);
  const satang = roundedSatang % 100;
  const bahtText = `${readInteger(baht)}บาท`;

  if (satang === 0) {
    return `${bahtText}ถ้วน`;
  }

  return `${bahtText}${readInteger(satang)}สตางค์`;
}
