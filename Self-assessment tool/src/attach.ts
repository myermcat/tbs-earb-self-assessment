import type { Attachment } from './types';

/**
 * Attachments travel inside the assessment file as base64, so that one saved file is the
 * whole submission and an assessor can open the evidence without emailing anybody.
 *
 * Base64 costs about a third in size, so the caps below are about what a departmental mail
 * system will actually carry.
 */
export const PER_FILE_LIMIT = 15 * 1024 * 1024;
export const TOTAL_WARN = 20 * 1024 * 1024;
export const TOTAL_LIMIT = 50 * 1024 * 1024;

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  const CHUNK = 0x8000;                       // chunked, or a big file blows the call stack
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

export async function readAttachment(file: File): Promise<Attachment> {
  if (file.size > PER_FILE_LIMIT) {
    throw new Error(
      `${file.name} is ${humanSize(file.size)}. The limit for one attachment is ${humanSize(PER_FILE_LIMIT)} - point at it instead of attaching it.`,
    );
  }
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    data: toBase64(await file.arrayBuffer()),
  };
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Opens an attachment in a new tab from memory. No server, no download folder. */
export function openAttachment(att: Attachment): void {
  const blob = new Blob([fromBase64(att.data)], { type: att.type });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function totalAttachedBytes(answers: Record<string, { evidence?: { attachment?: Attachment }[] }>): number {
  let n = 0;
  for (const ans of Object.values(answers)) {
    for (const e of ans.evidence ?? []) n += e.attachment?.size ?? 0;
  }
  return n;
}
