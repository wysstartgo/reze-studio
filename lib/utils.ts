import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { AnimationClip, BoneInterpolation, BoneKeyframe, ControlPoint, MorphKeyframe, Model } from "reze-engine"
import { Quat, Vec3 } from "reze-engine"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Clip length (ruler / export end vs last key) ─────────────────────────
/** New / reset studio clips start here so transport + ruler work before any keys (30fps → 4s). */
export const DEFAULT_STUDIO_CLIP_FRAMES = 120

export function maxKeyframeFrameInClip(clip: AnimationClip): number {
  let m = 0
  for (const t of clip.boneTracks.values()) for (const k of t) m = Math.max(m, k.frame)
  for (const t of clip.morphTracks.values()) for (const k of t) m = Math.max(m, k.frame)
  return m
}

/** Keep export end ≥ last key; run after any key add/move/delete so duration never truncates content. */
export function clipAfterKeyframeEdit(clip: AnimationClip): AnimationClip {
  const lastKey = maxKeyframeFrameInClip(clip)
  return { ...clip, frameCount: Math.max(1, clip.frameCount, lastKey) }
}

// ─── Keyframe insert + engine pose read/write ────────────────────────────
/** Default VMD-style linear-ish handles (127-space). */
export const VMD_LINEAR_DEFAULT_IP: BoneInterpolation = {
  rotation: [
    { x: 20, y: 20 },
    { x: 107, y: 107 },
  ],
  translationX: [
    { x: 20, y: 20 },
    { x: 107, y: 107 },
  ],
  translationY: [
    { x: 20, y: 20 },
    { x: 107, y: 107 },
  ],
  translationZ: [
    { x: 20, y: 20 },
    { x: 107, y: 107 },
  ],
}

export function cloneBoneInterpolation(ip: BoneInterpolation): BoneInterpolation {
  const cp = (a: { x: number; y: number }[]) => a.map((p) => ({ x: p.x, y: p.y }))
  return {
    rotation: cp(ip.rotation),
    translationX: cp(ip.translationX),
    translationY: cp(ip.translationY),
    translationZ: cp(ip.translationZ),
  }
}

/** Interpolation for a new/replaced key: same frame copy, else previous key, else any key, else default. */
export function interpolationTemplateForFrame(track: BoneKeyframe[] | undefined, frame: number): BoneInterpolation {
  if (!track?.length) return cloneBoneInterpolation(VMD_LINEAR_DEFAULT_IP)
  const at = track.find((k) => k.frame === frame)
  if (at) return cloneBoneInterpolation(at.interpolation)
  let prev: BoneKeyframe | null = null
  for (const k of track) {
    if (k.frame < frame && (!prev || k.frame > prev.frame)) prev = k
  }
  const basis = prev ?? track.reduce((a, b) => (a.frame > b.frame ? a : b))
  return cloneBoneInterpolation(basis.interpolation)
}

/** Add or replace a key at `frame`; keeps existing interpolation when replacing, else template from neighbors. */
export function upsertBoneKeyframeAtFrame(
  clip: AnimationClip,
  bone: string,
  frame: number,
  rotation: Quat,
  translation: Vec3,
): AnimationClip {
  const prevTrack = clip.boneTracks.get(bone) ?? []
  const existing = prevTrack.find((k) => k.frame === frame)
  const ip = existing ? cloneBoneInterpolation(existing.interpolation) : interpolationTemplateForFrame(prevTrack, frame)
  const nextTrack = prevTrack.filter((k) => k.frame !== frame)
  nextTrack.push({
    boneName: bone,
    frame,
    rotation,
    translation,
    interpolation: ip,
  })
  nextTrack.sort((a, b) => a.frame - b.frame)
  const boneTracks = new Map(clip.boneTracks)
  boneTracks.set(bone, nextTrack)
  return { ...clip, boneTracks }
}

/** Add or replace a morph keyframe at `frame`. */
export function upsertMorphKeyframeAtFrame(
  clip: AnimationClip,
  morphName: string,
  frame: number,
  weight: number,
): AnimationClip {
  const prevTrack = clip.morphTracks.get(morphName) ?? []
  const nextTrack = prevTrack.filter((k) => k.frame !== frame)
  nextTrack.push({ morphName, frame, weight })
  nextTrack.sort((a, b) => a.frame - b.frame)
  const morphTracks = new Map(clip.morphTracks)
  morphTracks.set(morphName, nextTrack)
  return { ...clip, morphTracks }
}

// Engine does not expose local pose yet; after `seek` this matches the drawn skeleton.
type RuntimeAccess = {
  runtimeSkeleton: {
    nameIndex: Record<string, number>
    localRotations: Quat[]
    localTranslations: Vec3[]
  }
}

export function readLocalPoseAfterSeek(model: Model, boneName: string): { rotation: Quat; translation: Vec3 } | null {
  const rt = (model as unknown as RuntimeAccess).runtimeSkeleton
  const idx = rt.nameIndex[boneName]
  if (idx === undefined || idx < 0) return null
  const r = rt.localRotations[idx]
  const t = rt.localTranslations[idx]
  return {
    rotation: r.clone(),
    translation: new Vec3(t.x, t.y, t.z),
  }
}

/** Direct local translation write (VMD pipeline uses moveBones with world-relative delta; inspector edits local space). */
export function writeLocalTranslation(model: Model, boneName: string, t: Vec3): void {
  const rt = (model as unknown as RuntimeAccess).runtimeSkeleton
  const idx = rt.nameIndex[boneName]
  if (idx === undefined || idx < 0) return
  const lt = rt.localTranslations[idx]
  lt.x = t.x
  lt.y = t.y
  lt.z = t.z
}

// ─── Deep clone of an AnimationClip (immutable history snapshot) ────────
// Slider preview mutates keyframe objects in place (atKey.rotation = q) and
// the engine shares the same arrays for performance. Undo therefore can't
// rely on the "previous reference" being unchanged — we have to clone.
export function cloneAnimationClip(clip: AnimationClip): AnimationClip {
  const boneTracks = new Map<string, BoneKeyframe[]>()
  for (const [name, track] of clip.boneTracks) {
    boneTracks.set(
      name,
      track.map((k) => ({
        boneName: k.boneName,
        frame: k.frame,
        rotation: k.rotation.clone(),
        translation: new Vec3(k.translation.x, k.translation.y, k.translation.z),
        interpolation: cloneBoneInterpolation(k.interpolation),
      })),
    )
  }
  const morphTracks = new Map<string, MorphKeyframe[]>()
  for (const [name, track] of clip.morphTracks) {
    morphTracks.set(
      name,
      track.map((k) => ({ morphName: k.morphName, frame: k.frame, weight: k.weight })),
    )
  }
  return { ...clip, boneTracks, morphTracks }
}

// ─── Bone-track keyframe reduction ───────────────────────────────────────
// Iterative greedy "remove if tolerated" pass. For each interior key we
// reconstruct the track without it and measure max deviation vs the *original*
// densely-sampled track across every integer frame in the affected span. If
// rotation angle and per-axis translation both stay under the fixed thresholds,
// drop the key. Repeats until no key can be dropped. First and last keys are
// always kept.
//
// Comparing against original samples (rather than the running, partially
// simplified track) bounds total drift to ε per channel — drops never
// compound, so we can run looser tolerances without visual change.
//
// Fixed tolerances (no user knob by design):
export const SIMPLIFY_ROT_DEG = 1.0 // visible-but-tiny rotation drift
export const SIMPLIFY_TRANS = 0.02 // MMD units (~3mm at character scale)

const INV_127 = 1 / 127

// Same bezier-at-t evaluator reze-engine uses internally; duplicated because
// the engine does not export interpolateControlPoints.
function bezierY(cp: ControlPoint[], t: number): number {
  const x1 = cp[0].x * INV_127
  const x2 = cp[1].x * INV_127
  const y1 = cp[0].y * INV_127
  const y2 = cp[1].y * INV_127
  const tt = Math.max(0, Math.min(1, t))
  let lo = 0
  let hi = 1
  let mid = 0.5
  for (let i = 0; i < 15; i++) {
    const x = 3 * (1 - mid) * (1 - mid) * mid * x1 + 3 * (1 - mid) * mid * mid * x2 + mid * mid * mid
    if (Math.abs(x - tt) < 1e-4) break
    if (x < tt) lo = mid
    else hi = mid
    mid = (lo + hi) / 2
  }
  return 3 * (1 - mid) * (1 - mid) * mid * y1 + 3 * (1 - mid) * mid * mid * y2 + mid * mid * mid
}

// Evaluate a sorted bone track at integer frame `f`. VMD convention: the
// interpolation stored on keyframe B shapes the segment A→B.
function evalBoneTrackAt(track: BoneKeyframe[], f: number): { rotation: Quat; translation: Vec3 } {
  if (f <= track[0].frame) {
    const t0 = track[0].translation
    return { rotation: track[0].rotation.clone(), translation: new Vec3(t0.x, t0.y, t0.z) }
  }
  const last = track.length - 1
  if (f >= track[last].frame) {
    const tl = track[last].translation
    return { rotation: track[last].rotation.clone(), translation: new Vec3(tl.x, tl.y, tl.z) }
  }
  let i = 1
  while (i < last && track[i].frame <= f) i++
  const a = track[i - 1]
  const b = track[i]
  const span = b.frame - a.frame
  const g = span > 0 ? (f - a.frame) / span : 0
  const rotT = bezierY(b.interpolation.rotation, g)
  const rotation = Quat.slerp(a.rotation, b.rotation, rotT)
  const txT = bezierY(b.interpolation.translationX, g)
  const tyT = bezierY(b.interpolation.translationY, g)
  const tzT = bezierY(b.interpolation.translationZ, g)
  return {
    rotation,
    translation: new Vec3(
      a.translation.x + (b.translation.x - a.translation.x) * txT,
      a.translation.y + (b.translation.y - a.translation.y) * tyT,
      a.translation.z + (b.translation.z - a.translation.z) * tzT,
    ),
  }
}

// Angle between two unit quats in degrees. Uses |dot| to ignore double-cover.
function quatAngleDegrees(a: Quat, b: Quat): number {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)
  const clamped = d > 1 ? 1 : d
  return 2 * Math.acos(clamped) * (180 / Math.PI)
}

export function simplifyBoneTrack(
  track: BoneKeyframe[],
  epsRotDeg: number = SIMPLIFY_ROT_DEG,
  epsTrans: number = SIMPLIFY_TRANS,
): BoneKeyframe[] {
  if (track.length <= 2) return track
  // Sample the original track once per integer frame across its full span.
  // First and last keys are never removed, so `cur` always spans [f0, fN]
  // and indexing into these arrays by `f - f0` stays valid.
  const f0 = track[0].frame
  const fN = track[track.length - 1].frame
  const originalRot: Quat[] = new Array(fN - f0 + 1)
  const originalTr: Vec3[] = new Array(fN - f0 + 1)
  for (let f = f0; f <= fN; f++) {
    const s = evalBoneTrackAt(track, f)
    originalRot[f - f0] = s.rotation
    originalTr[f - f0] = s.translation
  }
  const cur = [...track]
  // Each pass removes at most one key then restarts so neighbor relationships
  // stay consistent. O(n² × span) but n is small in practice.
  for (;;) {
    let dropped = false
    for (let i = 1; i < cur.length - 1; i++) {
      const prev = cur[i - 1]
      const next = cur[i + 1]
      const a = prev.frame
      const b = next.frame
      if (b <= a) continue
      const without = [prev, next]
      let maxRot = 0
      let maxTr = 0
      for (let f = a; f <= b; f++) {
        const r = evalBoneTrackAt(without, f)
        const idx = f - f0
        const oRot = originalRot[idx]
        const oTr = originalTr[idx]
        const rotErr = quatAngleDegrees(oRot, r.rotation)
        const trErr = Math.max(
          Math.abs(oTr.x - r.translation.x),
          Math.abs(oTr.y - r.translation.y),
          Math.abs(oTr.z - r.translation.z),
        )
        if (rotErr > maxRot) maxRot = rotErr
        if (trErr > maxTr) maxTr = trErr
        if (maxRot > epsRotDeg || maxTr > epsTrans) break
      }
      if (maxRot <= epsRotDeg && maxTr <= epsTrans) {
        cur.splice(i, 1)
        dropped = true
        break
      }
    }
    if (!dropped) break
  }
  return cur
}
