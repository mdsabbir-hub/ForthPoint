import { ALLOWED_MIME, MAX_FILE_BYTES } from "./constants";

export function validateFileMeta(name: string, size: number, mime: string): string | null {
  if (!/\.xlsx$/i.test(name)) return "Only .xlsx files are accepted.";
  if (!Number.isFinite(size) || size <= 0) return "The file is empty.";
  if (size > MAX_FILE_BYTES) return `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  if (!ALLOWED_MIME.has(mime)) return "The file type is not an Excel workbook.";
  return null;
}

/** Checks the real content: a ZIP container that holds an Excel workbook part. */
export function looksLikeXlsx(buf: Uint8Array): boolean {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) return false;
  const text = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString("latin1");
  return text.includes("xl/workbook.xml");
}
