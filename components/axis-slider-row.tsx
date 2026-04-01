"use client"

import { useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

type AxisSliderRowProps = {
  axis: string
  color: string
  value: number
  min: number
  max: number
  decimals: number
  disabled?: boolean
  onChange: (v: number) => void
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** Center-zero slider + numeric field (MMD sidebar style). */
export function AxisSliderRow({
  axis,
  color,
  value,
  min,
  max,
  decimals,
  disabled,
  onChange,
}: AxisSliderRowProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const pct = ((value - min) / (max - min)) * 100

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return min
      const r = el.getBoundingClientRect()
      const t = clamp((clientX - r.left) / r.width, 0, 1)
      const v = min + t * (max - min)
      const step = decimals <= 2 ? 10 ** -decimals : 10 ** -4
      return Math.round(v / step) * step
    },
    [decimals, max, min],
  )

  useEffect(() => {
    return () => {
      dragging.current = false
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const move = (ev: PointerEvent) => {
      if (!dragging.current) return
      onChange(valueFromClientX(ev.clientX))
    }
    const up = () => {
      dragging.current = false
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    onChange(valueFromClientX(e.clientX))
  }

  return (
    <div className={cn("mb-1.5 flex items-center gap-1.5", disabled && "opacity-50")}>
      <span className="w-3.5 shrink-0 text-[10px] font-semibold" style={{ color }}>
        {axis}
      </span>
      <div ref={trackRef} className="relative flex h-[18px] flex-1 items-center">
        <div
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="relative h-[3px] w-full cursor-ew-resize rounded-sm bg-[#1a1a22]"
          onPointerDown={onPointerDown}
        >
          {value >= 0 ? (
            <div
              className="absolute top-0 h-full rounded-sm opacity-50"
              style={{ left: "50%", width: `${Math.max(0, pct - 50)}%`, background: color }}
            />
          ) : (
            <div
              className="absolute top-0 h-full rounded-sm opacity-50"
              style={{ right: "50%", width: `${Math.max(0, 50 - pct)}%`, background: color }}
            />
          )}
          <div
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-[1.5px] border-white/30"
            style={{ left: `${pct}%`, background: color }}
          />
        </div>
      </div>
      <input
        type="text"
        disabled={disabled}
        className="w-[52px] rounded border border-border bg-[#1a1a22] px-1 py-0.5 text-right font-mono text-[10px] tabular-nums text-foreground focus:border-[#6e8efa] focus:outline-none"
        style={{ color }}
        value={Number.isFinite(value) ? value.toFixed(decimals) : ""}
        onChange={(e) => {
          const x = parseFloat(e.target.value.replace(/,/g, "."))
          if (Number.isFinite(x)) onChange(clamp(x, min, max))
        }}
      />
    </div>
  )
}
