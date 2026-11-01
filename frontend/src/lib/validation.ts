// Same limits as the backend (docs/api-contract.md). The server is still the authority:
// these checks only save the user a round trip.

export const MAX_CV_BYTES = 5 * 1024 * 1024;
export const MAX_JD_CHARS = 20_000;

export function validateCv(file: File): string | null {
  if (!/\.(pdf|docx)$/i.test(file.name)) return "Please choose a PDF or DOCX file.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_CV_BYTES) return "This file is larger than 5 MB.";
  return null;
}

export function validateJd(text: string): string | null {
  if (!text.trim()) return "Paste the job description.";
  if (text.length > MAX_JD_CHARS) return "The job description is longer than 20,000 characters.";
  return null;
}

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
