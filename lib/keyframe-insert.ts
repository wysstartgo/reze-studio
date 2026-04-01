import type { AnimationClip, BoneInterpolation, BoneKeyframe, Model } from "reze-engine"
import { Quat, Vec3 } from "reze-engine"

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
