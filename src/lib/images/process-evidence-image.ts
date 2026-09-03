import type {
  EvidenceImage,
  EvidenceImageMimeType
} from "@/types/expense-request";

export const ACCEPTED_EVIDENCE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export const MAX_EVIDENCE_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_LONG_EDGE = 1200;
const MIN_LONG_EDGE = 640;
const TARGET_DATA_URL_LENGTH = 150_000;
const INITIAL_JPEG_QUALITY = 0.76;
const MIN_JPEG_QUALITY = 0.5;

export class EvidenceImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceImageError";
  }
}

function isAcceptedImageType(type: string): type is EvidenceImageMimeType {
  return ACCEPTED_EVIDENCE_IMAGE_TYPES.some((acceptedType) => acceptedType === type);
}

function drawBitmap(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  width: number,
  height: number
) {
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new EvidenceImageError("ไม่สามารถประมวลผลรูปภาพได้");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
}

function compressBitmap(bitmap: ImageBitmap) {
  const initialScale = Math.min(
    1,
    MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height)
  );
  let width = Math.max(1, Math.round(bitmap.width * initialScale));
  let height = Math.max(1, Math.round(bitmap.height * initialScale));
  let quality = INITIAL_JPEG_QUALITY;
  const canvas = document.createElement("canvas");
  let dataUrl = "";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    drawBitmap(canvas, bitmap, width, height);
    dataUrl = canvas.toDataURL("image/jpeg", quality);

    if (
      dataUrl.length <= TARGET_DATA_URL_LENGTH ||
      Math.max(width, height) <= MIN_LONG_EDGE
    ) {
      break;
    }

    const nextScale = Math.max(
      0.72,
      Math.sqrt(TARGET_DATA_URL_LENGTH / dataUrl.length) * 0.92
    );
    width = Math.max(1, Math.round(width * nextScale));
    height = Math.max(1, Math.round(height * nextScale));
    quality = Math.max(MIN_JPEG_QUALITY, quality - 0.06);
  }

  return dataUrl;
}

export async function processEvidenceImage(file: File): Promise<EvidenceImage> {
  const mimeType = file.type;

  if (!isAcceptedImageType(mimeType)) {
    throw new EvidenceImageError("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP เท่านั้น");
  }

  if (file.size > MAX_EVIDENCE_IMAGE_SIZE_BYTES) {
    throw new EvidenceImageError("ขนาดไฟล์ต้องไม่เกิน 8 MB");
  }

  const bitmap = await createImageBitmap(file);
  let dataUrl: string;

  try {
    dataUrl = compressBitmap(bitmap);
  } finally {
    bitmap.close();
  }

  return {
    fileName: file.name,
    mimeType: "image/jpeg",
    dataUrl
  };
}
