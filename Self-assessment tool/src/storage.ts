import type { Assessment, Rubric } from './types';

/**
 * There is no server. Persistence is two things:
 *   1. an autosave into this browser, so closing the tab does not lose work;
 *   2. a save-to-file, which produces the .json the submitter keeps and sends on.
 * Nothing leaves the machine unless the person exports it and sends it themselves.
 */

const KEY = 'gc-arch-assessment:draft';
export const APP_VERSION = '0.1.0';

export function blankAssessment(rubric: Rubric): Assessment {
  const now = new Date().toISOString();
  return {
    fileType: 'gc-arch-assessment',
    formatVersion: 1,
    rubric: { id: rubric.id, version: rubric.version, title: rubric.title },
    initiative: { name: '', department: '', contact: '', lifecycleStage: '', summary: '', classification: '' },
    answers: {},
    meta: { createdAt: now, updatedAt: now, appVersion: APP_VERSION },
  };
}

export function autosave(a: Assessment): void {
  a.meta.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* private window, or storage disabled. The file save still works. */
  }
}

export function loadDraft(): Assessment | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Assessment;
    return a?.fileType === 'gc-arch-assessment' ? a : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function download(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string): string {
  return (s || 'assessment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export async function readJsonFiles(files: FileList | File[]): Promise<{ file: string; data: unknown; error?: string }[]> {
  const out: { file: string; data: unknown; error?: string }[] = [];
  for (const f of Array.from(files)) {
    try {
      out.push({ file: f.name, data: JSON.parse(await f.text()) });
    } catch (e) {
      out.push({ file: f.name, data: null, error: (e as Error).message });
    }
  }
  return out;
}
