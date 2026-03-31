"use client"

import { useMemo } from "react"
import type { AnimationClip, BoneKeyframe } from "reze-engine"
import { Button } from "@/components/ui/button"
import type { SelectedKeyframe } from "@/components/timeline"
import { ALL_CHANNELS, boneDisplayLabel, quatToEuler } from "@/lib/animation"

function sampleBoneKeyframe(clip: AnimationClip | null, boneName: string, frame: number) {
  if (!clip) return null
  const track = clip.boneTracks.get(boneName)
  if (!track?.length) return null
  const f = Math.round(frame)
  let kf = track[0]
  for (const k of track) {
    if (k.frame <= f) kf = k
    else break
  }
  return kf
}

function findKeyframeAt(clip: AnimationClip, bone: string, frame: number): BoneKeyframe | null {
  const kf = clip.boneTracks.get(bone)?.find((k) => k.frame === frame)
  return kf ?? null
}

function bonesKeyedAtFrame(clip: AnimationClip, frame: number): { bone: string; kf: BoneKeyframe }[] {
  const out: { bone: string; kf: BoneKeyframe }[] = []
  for (const [bone, track] of clip.boneTracks) {
    const kf = track.find((k) => k.frame === frame)
    if (kf) out.push({ bone, kf })
  }
  out.sort((a, b) => a.bone.localeCompare(b.bone))
  return out
}

function interpolationForChannel(kf: BoneKeyframe, chKey: string | undefined) {
  if (!chKey) return null
  if (chKey === "rx" || chKey === "ry" || chKey === "rz") return kf.interpolation.rotation
  if (chKey === "tx") return kf.interpolation.translationX
  if (chKey === "ty") return kf.interpolation.translationY
  if (chKey === "tz") return kf.interpolation.translationZ
  return null
}

interface SelectionInspectorProps {
  clip: AnimationClip | null
  currentFrame: number
  activeBone: string | null
  activeMorph: string | null
  morphWeight: number | null
  selectedKeyframes: SelectedKeyframe[]
  onInsertKeyframeAtPlayhead: () => void
  onDeleteSelectedKeyframes: () => void
}

export function SelectionInspector({
  clip,
  currentFrame,
  activeBone,
  activeMorph,
  morphWeight,
  selectedKeyframes,
  onInsertKeyframeAtPlayhead,
  onDeleteSelectedKeyframes,
}: SelectionInspectorProps) {
  const fPlay = Math.round(currentFrame)
  const singleSel = selectedKeyframes.length === 1 ? selectedKeyframes[0] : null
  const multiSel = selectedKeyframes.length > 1

  const canDelete = clip && singleSel !== null
  const canInsert = !!(clip && activeBone && !activeMorph)

  const curveDetail = useMemo(() => {
    if (!clip || singleSel?.type !== "curve" || !singleSel.bone || !singleSel.channel) return null
    const kf = findKeyframeAt(clip, singleSel.bone, singleSel.frame)
    if (!kf) return null
    const ch = ALL_CHANNELS.find((c) => c.key === singleSel.channel)
    if (!ch) return null
    const val = ch.get(kf)
    const euler = quatToEuler(kf.rotation)
    const tr = kf.translation
    const ip = interpolationForChannel(kf, singleSel.channel)
    return { kf, ch, val, euler, tr, ip }
  }, [clip, singleSel])

  const dopeBones = useMemo(() => {
    if (!clip || singleSel?.type !== "dope") return null
    return bonesKeyedAtFrame(clip, singleSel.frame)
  }, [clip, singleSel])

  const kfBonePlay = activeBone && clip ? sampleBoneKeyframe(clip, activeBone, currentFrame) : null
  const eulerPlay = kfBonePlay ? quatToEuler(kfBonePlay.rotation) : null
  const trPlay = kfBonePlay?.translation
  const rotCpPlay = kfBonePlay?.interpolation.rotation
  const txCpPlay = kfBonePlay?.interpolation.translationX

  const showPlayheadPanel =
    (activeBone || activeMorph) && !multiSel && !(singleSel && (singleSel.type === "curve" || singleSel.type === "dope"))

  return (
    <div className="space-y-4 text-[11px] leading-relaxed text-foreground">
      {/* ─── Keyframe selection (timeline click) ─── */}
      {singleSel?.type === "curve" && curveDetail ? (
        <section className="space-y-2.5 rounded-md border border-border/80 bg-muted/20 p-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-amber-500/90">Curve key</div>
          <div className="font-mono text-[11px] text-blue-400/95">{boneDisplayLabel(singleSel.bone!)}</div>
          <div className="text-[11px] text-muted-foreground">
            Frame <span className="tabular-nums text-foreground/90">{singleSel.frame}</span>
            {clip ? <span> / {clip.frameCount}</span> : null}
          </div>
          <div>
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Channel</div>
            <div className="font-mono text-[11px]" style={{ color: curveDetail.ch.color }}>
              {curveDetail.ch.label}:{" "}
              <span className="tabular-nums text-foreground/90">
                {curveDetail.ch.group === "rot" ? `${curveDetail.val.toFixed(2)}°` : curveDetail.val.toFixed(3)}
              </span>
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Full key (bone)</div>
            <div className="grid grid-cols-3 gap-1 font-mono tabular-nums text-[11px]">
              <span className="text-[#e25555]">Rx {curveDetail.euler.x.toFixed(2)}</span>
              <span className="text-[#44bb55]">Ry {curveDetail.euler.y.toFixed(2)}</span>
              <span className="text-[#4477dd]">Rz {curveDetail.euler.z.toFixed(2)}</span>
            </div>
            <div className="mt-0.5 grid grid-cols-3 gap-1 font-mono tabular-nums text-[11px]">
              <span className="text-[#e2a055]">Tx {curveDetail.tr.x.toFixed(3)}</span>
              <span className="text-[#55bba0]">Ty {curveDetail.tr.y.toFixed(3)}</span>
              <span className="text-[#7755dd]">Tz {curveDetail.tr.z.toFixed(3)}</span>
            </div>
          </div>
          {curveDetail.ip?.length === 2 ? (
            <div className="font-mono text-[10px] text-muted-foreground">
              {curveDetail.ch.label} bez: ({curveDetail.ip[0].x},{curveDetail.ip[0].y}) → ({curveDetail.ip[1].x},{curveDetail.ip[1].y})
            </div>
          ) : null}
        </section>
      ) : null}

      {singleSel?.type === "dope" && dopeBones ? (
        <section className="space-y-2.5 rounded-md border border-border/80 bg-muted/20 p-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-amber-500/90">Dopesheet</div>
          <div className="text-[11px] text-muted-foreground">
            Frame <span className="tabular-nums text-foreground/90">{singleSel.frame}</span>
            {clip ? <span> / {clip.frameCount}</span> : null}
            <span className="ml-2 text-[10px]">
              · {dopeBones.length} bone{dopeBones.length === 1 ? "" : "s"} keyed
            </span>
          </div>
          <div className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
            {dopeBones.map(({ bone, kf }) => {
              const e = quatToEuler(kf.rotation)
              return (
                <div key={bone} className="border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                  <div className="font-mono text-[11px] text-blue-400/90">{boneDisplayLabel(bone)}</div>
                  <div className="mt-0.5 grid grid-cols-3 gap-x-1 font-mono tabular-nums text-[11px] text-muted-foreground">
                    <span className="text-[#e25555]">Rx {e.x.toFixed(1)}</span>
                    <span className="text-[#44bb55]">Ry {e.y.toFixed(1)}</span>
                    <span className="text-[#4477dd]">Rz {e.z.toFixed(1)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* ─── Playhead / list selection (no timeline key) ─── */}
      {showPlayheadPanel && activeBone ? (
        <section className="space-y-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Playhead · bone</div>
          <div className="font-mono text-[11px] text-blue-400/95">{boneDisplayLabel(activeBone)}</div>
          <div className="text-[11px] text-muted-foreground">
            Frame <span className="tabular-nums text-foreground/90">{fPlay}</span>
            {clip ? <span> / {clip.frameCount}</span> : null}
          </div>
          <div>
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Rotation (°)</div>
            {eulerPlay ? (
              <div className="grid grid-cols-3 gap-1 font-mono tabular-nums text-[11px]">
                <span className="text-[#e25555]">X {eulerPlay.x.toFixed(2)}</span>
                <span className="text-[#44bb55]">Y {eulerPlay.y.toFixed(2)}</span>
                <span className="text-[#4477dd]">Z {eulerPlay.z.toFixed(2)}</span>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">—</div>
            )}
          </div>
          <div>
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Translation</div>
            {trPlay ? (
              <div className="grid grid-cols-3 gap-1 font-mono tabular-nums text-[11px]">
                <span className="text-[#e2a055]">X {trPlay.x.toFixed(3)}</span>
                <span className="text-[#55bba0]">Y {trPlay.y.toFixed(3)}</span>
                <span className="text-[#7755dd]">Z {trPlay.z.toFixed(3)}</span>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">—</div>
            )}
          </div>
          <div>
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Interpolation</div>
            {rotCpPlay?.length === 2 && txCpPlay?.length === 2 ? (
              <div className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
                <div>
                  Rot: ({rotCpPlay[0].x},{rotCpPlay[0].y}) → ({rotCpPlay[1].x},{rotCpPlay[1].y})
                </div>
                <div>
                  Tra X: ({txCpPlay[0].x},{txCpPlay[0].y}) → ({txCpPlay[1].x},{txCpPlay[1].y})
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">—</div>
            )}
          </div>
        </section>
      ) : null}

      {showPlayheadPanel && activeMorph ? (
        <section className="space-y-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Playhead · morph</div>
          <div className="font-mono text-[11px] text-blue-400/95">{activeMorph}</div>
          <div className="font-mono tabular-nums text-[11px] text-foreground/90">
            {morphWeight !== null ? morphWeight.toFixed(2) : "—"}
          </div>
        </section>
      ) : null}

      <section className="space-y-2 border-t border-border pt-2.5">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Operations</div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="h-7 px-2 text-[11px]"
            disabled={!canInsert}
            onClick={onInsertKeyframeAtPlayhead}
          >
            Insert key
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="h-7 px-2 text-[11px]"
            disabled={!canDelete}
            onClick={onDeleteSelectedKeyframes}
          >
            Delete key
          </Button>
        </div>
      </section>
    </div>
  )
}
