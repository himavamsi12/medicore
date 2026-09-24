"use client";

import { useId, useState } from "react";
import {
  Area,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { Panel } from "@/components/layout/page";
import { ChartSkeleton } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Categorical slots in fixed order (validated palette). Never cycled past five. */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

export interface SeriesDef {
  key: string;
  label: string;
  /** index into SERIES; defaults to the series' position */
  slot?: number;
  type?: "line" | "area";
}

type Row = Record<string, unknown>;
type Fmt = (v: number) => string;

const AXIS = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;

/* ---------- Tooltip: values lead, labels follow, line keys ---------- */

interface TipPayload {
  dataKey?: string | number;
  value?: number | number[];
  color?: string;
}

function ChartTip({
  active,
  payload,
  label,
  series,
  format,
  labelFormat,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  series: SeriesDef[];
  format: Fmt;
  labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = series
    .map((s, i) => {
      const p = payload.find((x) => x.dataKey === s.key);
      if (!p || p.value === undefined || p.value === null || Array.isArray(p.value)) return null;
      return { label: s.label, value: p.value, color: SERIES[s.slot ?? i] };
    })
    .filter(Boolean) as { label: string; value: number; color: string }[];
  const band = payload.find((x) => x.dataKey === "band" && Array.isArray(x.value));
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-[var(--shadow-popover)]">
      <p className="mb-1.5 text-muted-foreground">{labelFormat ? labelFormat(String(label)) : label}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
            <span className="font-semibold tabular text-foreground">{format(r.value)}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
        {band && Array.isArray(band.value) && (
          <p className="text-muted-foreground">
            Range {format(band.value[0])} to {format(band.value[1])}
          </p>
        )}
      </div>
    </div>
  );
}

function Legend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-muted-foreground" aria-label="Legend">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("rounded-full", s.type === "area" ? "size-2" : "h-0.5 w-3")} style={{ background: SERIES[s.slot ?? i] }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Trend (line / area, optional forecast band) ---------- */

export function TrendChart({
  data,
  x,
  series,
  height = 240,
  format = (v) => v.toLocaleString("en-IN"),
  xFormat,
  labelFormat,
  band,
  forecastFrom,
  yDomain,
  reference,
}: {
  data: Row[];
  x: string;
  series: SeriesDef[];
  height?: number;
  format?: Fmt;
  xFormat?: (v: string) => string;
  labelFormat?: (v: string) => string;
  /** keys holding lower/upper bounds; drawn as a 10% wash */
  band?: { lower: string; upper: string; slot?: number };
  /** x value where forecast begins (draws a hairline) */
  forecastFrom?: string;
  yDomain?: [number | "auto", number | "auto"];
  reference?: { y: number; label: string };
}) {
  const gid = useId().replace(/:/g, "");
  const rows = band ? data.map((r) => ({ ...r, band: r[band.lower] !== undefined && r[band.lower] !== null ? [r[band.lower], r[band.upper]] : undefined })) : data;
  return (
    <div>
      <Legend series={series} />
      <div style={{ height }} className="px-1 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[s.slot ?? i]} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={SERIES[s.slot ?? i]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey={x} {...AXIS} tickFormatter={xFormat} minTickGap={24} dy={6} />
            <YAxis {...AXIS} width={52} tickFormatter={format} domain={yDomain ?? ["auto", "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={(p) => <ChartTip active={p.active} payload={p.payload as unknown as TipPayload[]} label={p.label as string} series={series} format={format} labelFormat={labelFormat} />}
            />
            {band && <Area dataKey="band" stroke="none" fill={SERIES[band.slot ?? 0]} fillOpacity={0.1} isAnimationActive={false} activeDot={false} />}
            {forecastFrom && <ReferenceLine x={forecastFrom} stroke="var(--chart-axis)" strokeWidth={1} label={{ value: "Forecast", position: "insideTopRight", fill: "var(--chart-axis)", fontSize: 11 }} />}
            {reference && <ReferenceLine y={reference.y} stroke="var(--chart-axis)" strokeWidth={1} label={{ value: reference.label, position: "insideTopLeft", fill: "var(--chart-axis)", fontSize: 11 }} />}
            {series.map((s, i) =>
              s.type === "area" ? (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[s.slot ?? i]} strokeWidth={2} fill={`url(#${gid}-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls isAnimationActive={false} />
              ) : (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[s.slot ?? i]} strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls isAnimationActive={false} />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Bars ---------- */

export function BarsChart({
  data,
  x,
  series,
  height = 240,
  layout = "vertical-bars",
  format = (v) => v.toLocaleString("en-IN"),
  xFormat,
  stacked = false,
  categoryWidth = 120,
}: {
  data: Row[];
  x: string;
  series: SeriesDef[];
  height?: number;
  /** "vertical-bars" = columns; "horizontal" = bars growing right from a category axis */
  layout?: "vertical-bars" | "horizontal";
  format?: Fmt;
  xFormat?: (v: string) => string;
  stacked?: boolean;
  categoryWidth?: number;
}) {
  const horizontal = layout === "horizontal";
  return (
    <div>
      <Legend series={series} />
      <div style={{ height }} className="px-1 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap="28%" barGap={2}>
            <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--chart-grid)" />
            {horizontal ? (
              <>
                <XAxis type="number" {...AXIS} tickFormatter={format} />
                <YAxis type="category" dataKey={x} {...AXIS} width={categoryWidth} tickFormatter={xFormat} interval={0} />
              </>
            ) : (
              <>
                <XAxis dataKey={x} {...AXIS} tickFormatter={xFormat} minTickGap={12} dy={6} />
                <YAxis {...AXIS} width={52} tickFormatter={format} />
              </>
            )}
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.6 }}
              content={(p) => <ChartTip active={p.active} payload={p.payload as unknown as TipPayload[]} label={p.label as string} series={series} format={format} labelFormat={xFormat} />}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId={stacked ? "s" : undefined}
                fill={SERIES[s.slot ?? i]}
                maxBarSize={24}
                stroke="var(--card)"
                strokeWidth={stacked ? 2 : 0}
                radius={stacked ? (i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </RBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Sparkline (stat tiles) ---------- */

export function Sparkline({ values, className, label }: { values: number[]; className?: string; label?: string }) {
  if (values.length < 2) return null;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className={cn("h-8 w-24", className)} role="img" aria-label={label ?? `Trend over ${values.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke="var(--chart-muted)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey={(d: { i: number; v: number }) => (d.i === values.length - 1 ? d.v : null)}
            stroke="none"
            dot={{ r: 3, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Chart card with a table view ---------- */

export function ChartCard({
  title,
  description,
  actions,
  loading,
  table,
  children,
  className,
  height = 240,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  loading?: boolean;
  /** rows for the accessible table view: first entry is the header */
  table?: { columns: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Panel
      title={title}
      description={description}
      className={className}
      bodyClassName="pb-3"
      actions={
        <>
          {actions}
          {table && (
            <Button variant="ghost" size="icon-sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} aria-label={asTable ? "Show chart" : "Show as table"}>
              {asTable ? <LineIcon strokeWidth={ICON_STROKE} /> : <Table2 strokeWidth={ICON_STROKE} />}
            </Button>
          )}
        </>
      }
    >
      {loading ? (
        <ChartSkeleton height={height} />
      ) : asTable && table ? (
        <div className="max-h-[320px] overflow-auto px-4 pt-3 scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>{table.columns.map((c) => <th key={c} className="py-1.5 pr-4 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={cn("py-1.5 pr-4", j > 0 && "num")}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Panel>
  );
}
