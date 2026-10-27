export function evidenceFileName(date: string, mimeType: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid evidence date");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : mimeType === "image/jpeg" ? "jpg" : null;
  if (!extension) throw new Error("Invalid evidence filename");
  return `${date.replaceAll("-", "")}.${extension}`;
}
