"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Contrast, Crosshair, Minus, Move, Plus, RotateCcw, SunMedium } from "lucide-react";
import type { RadiologyFinding, StudyKind } from "@/types";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/*
 * Synthetic study viewer. Images are generated locally from a density field per study kind,
 * so no PHI or DICOM ever ships with the demo. When a PACS is connected, swap `useDensity`
 * for decoded pixel data (e.g. a Cornerstone viewport) and keep the controls.
 */

const SIZE = 512;
const NO_FINDINGS: RadiologyFinding[] = [];

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Soft-edged ellipse membership, 1 inside and 0 outside. */
function ell(x: number, y: number, cx: number, cy: number, rx: number, ry: number, edge = 0.08) {
  const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
  return Math.min(1, Math.max(0, (1 - d) / edge));
}

function box(x: number, y: number, cx: number, cy: number, hw: number, hh: number, edge = 0.012) {
  const dx = Math.abs(x - cx) - hw;
  const dy = Math.abs(y - cy) - hh;
  return Math.min(1, Math.max(0, -Math.max(dx, dy) / edge));
}

type Field = (x: number, y: number) => number;

const FIELDS: Record<StudyKind, Field> = {
  chest: (x, y) => {
    const body = ell(x, y, 0, 0.05, 0.92, 1.05, 0.05) * 0.42;
    const lungs = Math.max(ell(x, y, -0.4, -0.02, 0.3, 0.62), ell(x, y, 0.4, -0.02, 0.3, 0.62));
    const heart = ell(x, y, 0.1, 0.28, 0.3, 0.26) * 0.25;
    const spine = box(x, y, 0, 0, 0.07, 1) * 0.35;
    const ribPhase = Math.sin((y + Math.abs(x) * 0.45) * 26);
    const ribs = lungs > 0.2 && ribPhase > 0.72 ? 0.16 : 0;
    const diaphragm = y > 0.55 + 0.1 * Math.cos(x * 3) ? 0.2 : 0;
    const clav = Math.abs(y + 0.62 - Math.abs(x) * 0.18) < 0.025 && Math.abs(x) < 0.6 ? 0.3 : 0;
    return body - lungs * 0.34 + heart + spine + ribs + diaphragm * body + clav;
  },
  brain: (x, y) => {
    const head = ell(x, y, 0, 0, 0.78, 0.92, 0.02);
    const brain = ell(x, y, 0, 0, 0.7, 0.84, 0.02);
    const skull = (head - brain) * 0.95;
    const vent = Math.max(ell(x, y, -0.14, -0.05, 0.08, 0.28, 0.2), ell(x, y, 0.14, -0.05, 0.08, 0.28, 0.2));
    const sulci = brain * (Math.sin(Math.atan2(y, x) * 22 + Math.hypot(x, y) * 30) > 0.93 && Math.hypot(x / 0.7, y / 0.84) > 0.8 ? -0.08 : 0);
    const grey = brain * (0.48 + 0.05 * ell(x, y, 0, 0, 0.55, 0.7, 0.4));
    return skull + grey - vent * 0.3 + sulci;
  },
  abdomen: (x, y) => {
    const body = ell(x, y, 0, 0, 0.9, 0.7, 0.03) * 0.46;
    const fat = (ell(x, y, 0, 0, 0.9, 0.7, 0.03) - ell(x, y, 0, 0, 0.8, 0.6, 0.05)) * -0.12;
    const liver = ell(x, y, -0.4, -0.12, 0.38, 0.3) * 0.12;
    const spine = ell(x, y, 0, 0.42, 0.13, 0.12, 0.1) * 0.5;
    const kidneys = Math.max(ell(x, y, -0.32, 0.3, 0.12, 0.16), ell(x, y, 0.32, 0.3, 0.12, 0.16)) * 0.14;
    const aorta = ell(x, y, 0.06, 0.24, 0.05, 0.05) * 0.2;
    const bowel = body > 0 && Math.sin(x * 19) * Math.cos(y * 17) > 0.6 && x > 0 ? -0.18 : 0;
    return body + fat + liver + spine + kidneys + aorta + bowel;
  },
  knee: (x, y) => {
    const soft = box(x, y, 0, 0, 0.5, 1.1, 0.12) * 0.28;
    const femur = Math.max(box(x, y, 0, -0.62, 0.2, 0.42), ell(x, y, 0, -0.18, 0.36, 0.14, 0.1)) * (y < -0.06 ? 1 : 0);
    const tibia = Math.max(box(x, y, 0, 0.62, 0.19, 0.44), ell(x, y, 0, 0.12, 0.36, 0.08, 0.1)) * (y > 0.06 ? 1 : 0);
    const patella = ell(x, y, 0.36, -0.28, 0.08, 0.14) * 0.35;
    const cortex = (femur + tibia) * (Math.abs(x) > 0.14 && Math.abs(y) > 0.3 ? 0.18 : 0);
    return soft + (femur + tibia) * 0.5 + cortex + patella;
  },
  spine: (x, y) => {
    const soft = box(x, y, 0, 0, 0.62, 1.1, 0.2) * 0.25;
    const k = Math.round((y + 1) / 0.28);
    const cy = -1 + k * 0.28;
    const vert = box(x, y, 0.05, cy, 0.22, 0.105, 0.02) * 0.46;
    const disc = Math.abs(y - (cy + 0.14)) < 0.03 && Math.abs(x - 0.05) < 0.22 ? 0.14 : 0;
    const canal = box(x, y, -0.3, 0, 0.06, 1.1, 0.03) * 0.1;
    return soft + vert + disc + canal;
  },
  pelvis: (x, y) => {
    const body = ell(x, y, 0, 0.05, 0.95, 0.9, 0.05) * 0.3;
    const ilia = Math.max(ell(x, y, -0.5, -0.35, 0.34, 0.36), ell(x, y, 0.5, -0.35, 0.34, 0.36)) * 0.3;
    const inlet = ell(x, y, 0, -0.05, 0.3, 0.3, 0.1) * -0.22;
    const heads = Math.max(ell(x, y, -0.55, 0.3, 0.14, 0.14), ell(x, y, 0.55, 0.3, 0.14, 0.14)) * 0.42;
    const necks = Math.max(box(x, y, -0.62, 0.62, 0.1, 0.3), box(x, y, 0.62, 0.62, 0.1, 0.3)) * 0.4;
    const sacrum = ell(x, y, 0, -0.3, 0.14, 0.26) * 0.28;
    return body + ilia + inlet + heads + necks + sacrum;
  },
};

/** Density map in 0..1 for a study, with film grain and a lesion at each AI finding. */
function useDensity(kind: StudyKind, seed: number, lesions: RadiologyFinding[]) {
  return useMemo(() => {
    const rnd = mulberry(seed);
    const f = FIELDS[kind];
    const out = new Float32Array(SIZE * SIZE);
    for (let j = 0; j < SIZE; j++) {
      for (let i = 0; i < SIZE; i++) {
        const x = (i / SIZE) * 2 - 1;
        const y = (j / SIZE) * 2 - 1;
        let d = f(x, y);
        for (const l of lesions) {
          const cx = l.box.x + l.box.w / 2;
          const cy = l.box.y + l.box.h / 2;
          const m = ell(i / SIZE, j / SIZE, cx, cy, l.box.w / 2.4, l.box.h / 2.4, 0.6);
          d += m * (kind === "chest" ? 0.2 : 0.12);
        }
        out[j * SIZE + i] = Math.min(1, Math.max(0, d + (rnd() - 0.5) * 0.05));
      }
    }
    return out;
  }, [kind, seed, lesions]);
}

export interface ViewerProps {
  kind: StudyKind;
  seed: number;
  label: string;
  findings?: RadiologyFinding[];
  showOverlay: boolean;
  activeFinding?: string;
  onFindingHover?: (id?: string) => void;
}

const PRESETS: Record<string, { w: number; l: number }> = { Default: { w: 1, l: 0.5 }, "Soft tissue": { w: 0.5, l: 0.45 }, Bone: { w: 0.7, l: 0.7 }, Lung: { w: 0.6, l: 0.25 } };

export function StudyViewer({ kind, seed, label, findings = NO_FINDINGS, showOverlay, activeFinding, onFindingHover }: ViewerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [win, setWin] = useState(PRESETS.Default);
  const [invert, setInvert] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<"pan" | "wl">("pan");
  const drag = useRef<{ x: number; y: number } | null>(null);
  const density = useDensity(kind, seed, findings);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(SIZE, SIZE);
    const lo = win.l - win.w / 2;
    for (let k = 0; k < density.length; k++) {
      let v = Math.min(1, Math.max(0, (density[k] - lo) / win.w));
      if (invert) v = 1 - v;
      const g = Math.round(v * 255);
      img.data[k * 4] = g;
      img.data[k * 4 + 1] = g;
      img.data[k * 4 + 2] = g;
      img.data[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [density, win, invert]);

  const reset = () => {
    setWin(PRESETS.Default);
    setInvert(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = 24;
    const map: Record<string, () => void> = {
      "+": () => setZoom((z) => Math.min(4, z + 0.25)),
      "=": () => setZoom((z) => Math.min(4, z + 0.25)),
      "-": () => setZoom((z) => Math.max(1, z - 0.25)),
      ArrowLeft: () => setPan((p) => ({ ...p, x: p.x + step })),
      ArrowRight: () => setPan((p) => ({ ...p, x: p.x - step })),
      ArrowUp: () => setPan((p) => ({ ...p, y: p.y + step })),
      ArrowDown: () => setPan((p) => ({ ...p, y: p.y - step })),
      i: () => setInvert((v) => !v),
      r: reset,
    };
    if (map[e.key]) {
      e.preventDefault();
      map[e.key]();
    }
  };

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-[oklch(0.16_0.01_262)] text-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-2 py-1.5" role="toolbar" aria-label="Viewer tools">
        <ToolButton label="Pan" active={tool === "pan"} onClick={() => setTool("pan")}>
          <Move strokeWidth={ICON_STROKE} />
        </ToolButton>
        <ToolButton label="Window / level (drag)" active={tool === "wl"} onClick={() => setTool("wl")}>
          <SunMedium strokeWidth={ICON_STROKE} />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-white/15" aria-hidden />
        <ToolButton label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>
          <Minus strokeWidth={ICON_STROKE} />
        </ToolButton>
        <span className="num w-11 text-center text-xs text-white/70" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <ToolButton label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
          <Plus strokeWidth={ICON_STROKE} />
        </ToolButton>
        <ToolButton label="Invert" active={invert} onClick={() => setInvert((v) => !v)}>
          <Contrast strokeWidth={ICON_STROKE} />
        </ToolButton>
        <ToolButton label="Reset view" onClick={reset}>
          <RotateCcw strokeWidth={ICON_STROKE} />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-white/15" aria-hidden />
        <label className="flex items-center gap-1.5 text-xs text-white/70">
          Preset
          <select
            className="h-7 rounded-md border border-white/15 bg-white/5 px-1.5 text-xs text-white outline-none focus-visible:border-white/50"
            value={Object.entries(PRESETS).find(([, p]) => p.w === win.w && p.l === win.l)?.[0] ?? ""}
            onChange={(e) => PRESETS[e.target.value] && setWin(PRESETS[e.target.value])}
          >
            <option value="" disabled>
              Custom
            </option>
            {Object.keys(PRESETS).map((k) => (
              <option key={k} value={k} className="text-black">
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        tabIndex={0}
        role="img"
        aria-label={`${label}. Use plus and minus to zoom, arrow keys to pan, I to invert, R to reset.`}
        onKeyDown={onKey}
        className={cn("relative aspect-square w-full touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair")}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          if (tool === "pan") setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
          else setWin((w) => ({ w: Math.min(1.6, Math.max(0.08, w.w + dx / 400)), l: Math.min(1, Math.max(0, w.l - dy / 400)) }));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - Math.sign(e.deltaY) * 0.125)))}
      >
        <div className="absolute inset-0 origin-center" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <canvas ref={canvas} width={SIZE} height={SIZE} className="size-full [image-rendering:auto]" />
          {showOverlay &&
            findings.map((f) => (
              <button
                key={f.id}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={() => onFindingHover?.(f.id)}
                onMouseLeave={() => onFindingHover?.(undefined)}
                onFocus={() => onFindingHover?.(f.id)}
                onBlur={() => onFindingHover?.(undefined)}
                aria-label={`AI finding ${f.id}: ${f.label}`}
                className={cn(
                  "absolute rounded-sm border-2 border-dashed transition-colors",
                  f.severity === "critical" ? "border-[#ff7a6b]" : f.severity === "warning" ? "border-[#f5c451]" : "border-[#8fb8ff]",
                  activeFinding === f.id && "border-solid bg-white/10",
                )}
                style={{ left: `${f.box.x * 100}%`, top: `${f.box.y * 100}%`, width: `${f.box.w * 100}%`, height: `${f.box.h * 100}%` }}
              >
                <span className="absolute -top-5 left-0 rounded-sm bg-black/70 px-1 text-[10px] font-medium whitespace-nowrap">{f.id}</span>
              </button>
            ))}
        </div>
        <div className="pointer-events-none absolute top-2 left-2 text-[11px] leading-tight text-white/70">
          <p>{label}</p>
        </div>
        <div className="num pointer-events-none absolute right-2 bottom-2 text-right text-[11px] leading-tight text-white/70">
          <p>W {Math.round(win.w * 400)} / L {Math.round(win.l * 400 - 200)}</p>
          <p>{invert ? "Inverted" : ""}</p>
        </div>
        <Crosshair className="pointer-events-none absolute bottom-2 left-2 size-3.5 text-white/40" aria-hidden />
      </div>
    </div>
  );
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn("text-white/80 hover:bg-white/10 hover:text-white", active && "bg-white/15 text-white")}
    >
      {children}
    </Button>
  );
}
