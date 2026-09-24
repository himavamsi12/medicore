"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { labService } from "@/services/labService";
import { PrintSheet } from "@/components/layout/print-sheet";
import { formatRange } from "@/lib/clinical";
import { dateTime } from "@/lib/format";

const FLAG_TEXT: Record<string, string> = { H: "High", L: "Low", HH: "Critical high", LL: "Critical low", A: "Abnormal", N: "" };

export default function LabReportPrint() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["lab-order", id], queryFn: () => labService.getOrder(id) });
  if (!q.data) return <p className="p-8 text-center text-sm text-muted-foreground">{q.error ? "Report not found." : "Preparing report…"}</p>;
  const o = q.data;
  return (
    <PrintSheet title="Laboratory report" meta={<>{o.orderNo} · Sample {o.sampleId}</>}>
      <section className="grid grid-cols-2 gap-x-8 gap-y-1 rounded border border-neutral-300 p-3 text-[11.5px]">
        <p><b>Patient:</b> {o.patient.fullName}</p>
        <p><b>UHID:</b> {o.patient.uhid}</p>
        <p><b>Age / sex:</b> {o.patient.ageLabel} / {o.patient.gender}</p>
        <p><b>Referred by:</b> {o.orderedBy.name}</p>
        <p><b>Collected:</b> {o.collectedAt ? dateTime(o.collectedAt) : "-"}</p>
        <p><b>Reported:</b> {o.resultedAt ? dateTime(o.resultedAt) : "-"}</p>
        <p><b>Sample:</b> {o.tests[0]?.sampleType}</p>
        <p><b>Location:</b> {o.location ?? o.source}</p>
      </section>
      {o.tests.map((t) => (
        <section key={t.code} className="mt-4">
          <h2 className="mb-1 border-b border-neutral-400 pb-1 text-[12px] font-semibold uppercase tracking-wide">{t.name} <span className="font-normal normal-case text-neutral-500">({t.category})</span></h2>
          <table className="w-full border-collapse text-[11.5px]">
            <thead><tr className="text-left text-neutral-600"><th className="py-1 pr-2 font-medium">Investigation</th><th className="py-1 pr-2 text-right font-medium">Result</th><th className="py-1 pr-2 font-medium">Unit</th><th className="py-1 pr-2 font-medium">Biological reference interval</th><th className="py-1 font-medium">Flag</th></tr></thead>
            <tbody>
              {t.parameters.map((p) => {
                const r = o.results.find((x) => x.testCode === t.code && x.paramCode === p.code);
                return (
                  <tr key={p.code} className="border-b border-neutral-100">
                    <td className="py-1 pr-2">{p.name}</td>
                    <td className={`py-1 pr-2 text-right ${r && r.flag !== "N" ? "font-bold" : ""}`}>{r?.value ?? "-"}</td>
                    <td className="py-1 pr-2">{p.unit}</td>
                    <td className="py-1 pr-2">{formatRange(p)}</td>
                    <td className="py-1">{r ? FLAG_TEXT[r.flag] : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
      {o.remarks && <p className="mt-3"><b>Remarks:</b> {o.remarks}</p>}
      <p className="mt-6 text-center text-[11px] text-neutral-500">*** End of report ***</p>
      <div className="mt-8 flex items-end justify-between">
        <p className="max-w-[60%] text-[10px] text-neutral-500">{o.status === "Verified" ? "Electronically verified." : "Provisional report, not yet verified."} Results relate only to the sample tested. Interpret in clinical context. NABL accredited laboratory (MC-LAB-0412).</p>
        <div className="text-right"><div className="mb-1 h-10 w-44 border-b border-neutral-500" /><p className="font-semibold">{o.verifiedBy ?? "Pending verification"}</p><p className="text-[11px] text-neutral-600">{o.verifiedAt ? dateTime(o.verifiedAt) : ""}</p></div>
      </div>
    </PrintSheet>
  );
}
