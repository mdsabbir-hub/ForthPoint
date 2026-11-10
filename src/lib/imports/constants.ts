export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_BATCH = 20;
export const WORKBOOK_BUCKET = "company-workbooks";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const ALLOWED_MIME = new Set([XLSX_MIME, "application/octet-stream", ""]);
