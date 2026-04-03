/** Editor state persistence — localStorage for small metadata, IndexedDB for clip data. */

import { idbGet, idbSet, idbDel } from "@/lib/idb"

const LS_KEY = "reze-editor-state"
const IDB_CLIP_KEY = "editor-clip"

export interface PersistedEditorMeta {
  activeBone: string | null
  activeMorph: string | null
  selectedGroup: string
  currentFrame: number
  clipDisplayName: string
  hasClip: boolean
}

const DEFAULTS: PersistedEditorMeta = {
  activeBone: null,
  activeMorph: null,
  selectedGroup: "All Bones",
  currentFrame: 0,
  clipDisplayName: "clip",
  hasClip: false,
}

export function saveMeta(meta: Partial<PersistedEditorMeta>): void {
  try {
    const prev = loadMeta()
    localStorage.setItem(LS_KEY, JSON.stringify({ ...prev, ...meta }))
  } catch {
    /* quota or private browsing — ignore */
  }
}

export function loadMeta(): PersistedEditorMeta {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function saveClip(vmd: ArrayBuffer): Promise<void> {
  try {
    await idbSet(IDB_CLIP_KEY, vmd)
  } catch {
    /* IndexedDB unavailable — ignore */
  }
}

export async function loadClip(): Promise<ArrayBuffer | undefined> {
  try {
    return await idbGet<ArrayBuffer>(IDB_CLIP_KEY)
  } catch {
    return undefined
  }
}

export async function clearClip(): Promise<void> {
  try {
    await idbDel(IDB_CLIP_KEY)
  } catch {
    /* ignore */
  }
}
