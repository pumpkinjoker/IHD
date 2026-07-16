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
const MAX_LONG_EDGE = 1800;
const JPEG_QUALITY = 0.86;

export class EvidenceImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceImageError";
  }
}

function isAcceptedImageType(type: string): type is EvidenceImageMimeType {
  return ACCEPTED_EVIDENCE_IMAGE_TYPES.some((acceptedType) => acceptedType === type);
}

function canvasToDataUrl(canvas: HTMLCanvasElement, mimeType: string) {
  if (mimeType === "image/png") {
    return canvas.toDataURL("image/png");
  }

  if (mimeType === "image/webp") {
    return canvas.toDataURL("image/webp", JPEG_QUALITY);
  }

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
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
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new EvidenceImageError("ไม่สามารถประมวลผลรูปภาพได้");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return {
    fileName: file.name,
    mimeType,
    dataUrl: canvasToDataUrl(canvas, mimeType)
  };
}
