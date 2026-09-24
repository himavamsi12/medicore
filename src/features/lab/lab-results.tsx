"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Sparkles } from "lucide-react";
import type { LabOrderView, ResultFlag } from "@/types";
import { aiService } from "@/services/aiService";
import { AiPanel, Analyzing } from "@/components/ai/ai";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { flagSeverity, formatRange } from "@/lib/clinical";
import { cn } from "@/lib/utils";

const FLAG_LABEL: Record<ResultFlag, string> = { N: "", L: "Low", H: "High", LL: "Critical low", HH: "Critical high", A: "Abnormal" };

export function FlagMark({ flag }: { flag: ResultFlag }) {
  if (flag === "N") return <span className="sr-only">Normal</span>;
  const tone = flagSeverity(flag);
  const Icon = flag === "H" || flag === "HH" ? ArrowUp : flag === "L" || flag === "LL" ? ArrowDown : null;
  return (
    <StatusBadge tone={tone} className="gap-0.5 px-1.5">
      {Icon && <Icon className="size-3" aria-hidden />}
      {FLAG_LABEL[flag]}
    </StatusBadge>
  );
}

/** Result table for one order: parameter, value, flag, reference range. */
export function LabResultsTable({ order, dense = false }: { order: LabOrderView; dense?: boolean }) {
  if (!order.results.length)
    return <p className="px-4 py-3 text-sm text-muted-foreground">Results not yet available ({order.status.toLowerCase()}).</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr className="border-b">
          <th className="px-4 py-2 text-left font-medium">Parameter</th>
          <th className="px-3 py-2 text-right font-medium">Result</th>
          <th className="px-3 py-2 text-left font-medium">Flag</th>
          <th className={cn("px-4 py-2 text-left font-medium", dense && "hidden sm:table-cell")}>Reference</th>
        </tr>
      </thead>
      {order.tests.map((t) => (
        <tbody key={t.code} className="divide-y">
          {order.tests.length > 1 && (
            <tr className="bg-muted/40">
              <td colSpan={4} className="px-4 py-1.5 text-xs font-medium text-muted-foreground">
                {t.name}
              </td>
            </tr>
          )}
          {t.parameters.map((p) => {
            const r = order.results.find((x) => x.testCode === t.code && x.paramCode === p.code);
            if (!r) return null;
            const abnormal = r.flag !== "N";
            return (
              <tr key={p.code} className={cn(r.flag === "HH" || r.flag === "LL" ? "bg-critical-soft/40" : undefined)}>
                <td className="px-4 py-1.5">{p.name}</td>
                <td className={cn("num px-3 py-1.5 text-right", abnormal && "font-semibold")}>
                  {r.value} <span className="text-xs font-normal text-muted-foreground">{p.unit}</span>
                </td>
                <td className="px-3 py-1.5">
                  <FlagMark flag={r.flag} />
                </td>
                <td className={cn("num px-4 py-1.5 text-xs text-muted-foreground", dense && "hidden sm:table-cell")}>
                  {formatRange(p)} {p.unit}
                </td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

/** AI Lab Result Interpreter. Runs on demand; output is advisory. */
export function LabInterpreter({ orderId, autoRun = false }: { orderId: string; autoRun?: boolean }) {
  const [run, setRun] = useState(autoRun);
  const q = useQuery({ queryKey: ["lab-interpret", orderId], queryFn: () => aiService.interpretLabs(orderId), enabled: run, staleTime: Infinity });
  return (
    <AiPanel title="Lab result interpreter" meta={q.data?.meta} onRegenerate={run ? () => q.refetch() : undefined} busy={q.isFetching}>
      {!run ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">Explains abnormal values, compares with previous results and suggests follow-up tests.</p>
          <Button variant="outline" size="sm" onClick={() => setRun(true)}>
            <Sparkles /> Interpret results
          </Button>
        </div>
      ) : q.isFetching && !q.data ? (
        <Analyzing steps={["Reading result values", "Comparing with previous results", "Checking against reference ranges", "Drafting interpretation"]} />
      ) : q.data ? (
        <div className="space-y-4 p-4 text-sm">
          <p className={cn("font-medium", q.data.abnormalities.some((a) => a.severity === "critical") && "text-critical-fg")}>{q.data.headline}</p>
          {q.data.abnormalities.length > 0 && (
            <ul className="space-y-2.5">
              {q.data.abnormalities.map((a) => (
                <li key={a.parameter} className="grid gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{a.parameter}</span>
                    <span className="num text-xs">{a.value}</span>
                    <StatusBadge tone={a.severity}>{a.severity === "critical" ? "Critical" : "Abnormal"}</StatusBadge>
                  </span>
                  <span className="text-muted-foreground">{a.interpretation}</span>
                </li>
              ))}
            </ul>
          )}
          {q.data.trends.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Trends</p>
              <ul className="list-disc space-y-1 pl-4 marker:text-subtle-foreground">
                {q.data.trends.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {q.data.suggestedFollowUp.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Consider</p>
              <ul className="list-disc space-y-1 pl-4 marker:text-subtle-foreground">
                {q.data.suggestedFollowUp.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </AiPanel>
  );
}
