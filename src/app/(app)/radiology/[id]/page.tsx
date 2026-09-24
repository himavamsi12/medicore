"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Check, Eye, EyeOff, ImageOff, Loader2, ShieldCheck } from "lucide-react";
import type { RadiologyStatus } from "@/types";
import { radiologyService } from "@/services/radiologyService";
import { aiService } from "@/services/aiService";
import { AiPanel, Analyzing, ReviewBar, type ReviewDecision } from "@/components/ai/ai";
import { EmptyState, ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { TextareaField } from "@/components/forms/fields";
import { Field, PageHeader, Panel } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { StudyViewer } from "@/features/radiology/viewer";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const NEXT: Partial<Record<RadiologyStatus, { to: RadiologyStatus; label: string }>> = {
  Ordered: { to: "Scheduled", label: "Schedule" },
  Scheduled: { to: "Acquired", label: "Mark acquired" },
};

const TECHNIQUE: Record<string, string> = {
  "X-Ray": "Single frontal projection obtained.",
  CT: "Axial sections acquired with multiplanar reformats.",
  MRI: "Multiplanar multisequence imaging obtained.",
  USG: "Real-time grey-scale and colour Doppler sonography performed.",
  Mammography: "Bilateral CC and MLO views obtained.",
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export default function RadiologyStudyPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { role, user } = useCurrentUser();
  const q = useQuery({ queryKey: ["radiology-order", id], queryFn: () => radiologyService.getOrder(id) });
  const acquired = Boolean(q.data && !["Ordered", "Scheduled"].includes(q.data.status));
  const ai = useQuery({ queryKey: ["radiology-ai", id], queryFn: () => aiService.getRadiologyFindings(id), enabled: acquired, staleTime: Infinity });
  const [overlay, setOverlay] = useState(true);
  const [active, setActive] = useState<string>();
  const [draft, setDraft] = useState<{ technique?: string; findings?: string; impression?: string }>({});
  const [decision, setDecision] = useState<ReviewDecision>();
  const impressionRef = useRef<HTMLTextAreaElement>(null);

  const invalidate = () => ["radiology-order", "radiology-orders", "documents", "timeline"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const advance = useMutation({
    mutationFn: (to: RadiologyStatus) => radiologyService.setStatus(id, to),
    onSuccess: (r) => {
      invalidate();
      toast.success(`${r.accessionNo}: ${r.status.toLowerCase()}`);
    },
  });
  const save = useMutation({
    mutationFn: (verify: boolean) => {
      const o = q.data!;
      return radiologyService.saveReport(
        o.id,
        { technique: draft.technique ?? o.report?.technique ?? TECHNIQUE[o.modality], findings: draft.findings ?? o.report?.findings ?? "", impression: draft.impression ?? o.report?.impression ?? "" },
        user?.doctorId ?? o.radiologistId ?? o.orderedById,
        verify,
      );
    },
    onSuccess: (r) => {
      invalidate();
      setDraft({});
      toast.success(r.status === "Verified" ? "Report verified and released" : "Report saved as preliminary");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (q.isLoading) return <PanelSkeleton lines={12} className="rounded-xl border" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;
  const next = NEXT[o.status];
  const canReport = can(role, "radiology.report") && acquired && o.status !== "Verified";
  const technique = draft.technique ?? o.report?.technique ?? TECHNIQUE[o.modality];
  const findingsText = draft.findings ?? o.report?.findings ?? "";
  const impression = draft.impression ?? o.report?.impression ?? "";
  const ready = findingsText.trim().length > 10 && impression.trim().length > 5;

  const applyAiDraft = (edit: boolean) => {
    if (!ai.data) return;
    setDraft((d) => ({
      ...d,
      findings: [findingsText.trim(), ...ai.data.findings.map((f) => `${f.label}: ${f.description}`)].filter(Boolean).join("\n"),
      impression: ai.data.draftImpression,
    }));
    setDecision(edit ? "edited" : "accepted");
    if (edit) requestAnimationFrame(() => impressionRef.current?.focus());
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={o.study}
        breadcrumbs={[{ label: "Radiology", href: "/radiology" }, { label: o.accessionNo }]}
        meta={
          <>
            <StatusBadge status={o.status} />
            <StatusBadge status={o.priority} />
            <span>{o.modality}</span>
            <span>{o.source}</span>
            <span className="num">{o.images} image{o.images > 1 ? "s" : ""}</span>
          </>
        }
        actions={
          next &&
          can(role, "radiology.report") && (
            <Button onClick={() => advance.mutate(next.to)} disabled={advance.isPending}>
              {next.label} <ArrowRight />
            </Button>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          {!acquired ? (
            <div className="rounded-xl border bg-card">
              <EmptyState icon={ImageOff} title="Images not yet acquired" description={o.status === "Scheduled" ? `Scheduled ${o.scheduledAt ? dateTime(o.scheduledAt) : ""}. Mark acquired once the scan is done.` : "Schedule the study to add it to the modality worklist."} />
            </div>
          ) : ai.isLoading ? (
            <div className="grid aspect-square w-full place-items-center rounded-xl border bg-[oklch(0.16_0.01_262)] text-sm text-white/70">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading study
              </span>
            </div>
          ) : (
            <StudyViewer
              kind={o.studyKind}
              seed={hash(o.id)}
              label={`${o.modality} ${o.bodyPart} · ${o.patient.fullName} · ${o.accessionNo}`}
              findings={ai.data?.findings}
              showOverlay={overlay}
              activeFinding={active}
              onFindingHover={setActive}
            />
          )}

          <Panel title="Requisition">
            <dl className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
              <Field label="Patient">
                <Link href={`/patients/${o.patientId}`} className="hover:underline">
                  {o.patient.fullName}
                </Link>
              </Field>
              <Field label="UHID">{o.patient.uhid}</Field>
              <Field label="Age / sex">{`${o.patient.ageLabel} / ${o.patient.gender}`}</Field>
              <Field label="Referred by">{o.orderedBy.name}</Field>
              <Field label="Ordered">{dateTime(o.orderedAt)}</Field>
              <Field label="Acquired">{o.acquiredAt ? dateTime(o.acquiredAt) : undefined}</Field>
              <Field label="Body part">{o.bodyPart}</Field>
              <Field label="Radiologist">{o.radiologist?.name}</Field>
              <Field label="Clinical history" className="col-span-2 md:col-span-4">
                {o.clinicalHistory}
              </Field>
            </dl>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {acquired && (
            <AiPanel
              title="AI findings"
              meta={ai.data?.meta}
              busy={ai.isFetching}
              actions={
                ai.data?.findings.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setOverlay((v) => !v)} aria-pressed={overlay}>
                    {overlay ? <EyeOff /> : <Eye />} {overlay ? "Hide" : "Show"} overlay
                  </Button>
                ) : undefined
              }
              footer={canReport && ai.data ? <ReviewBar decision={decision} acceptLabel="Insert into report" onAccept={() => applyAiDraft(false)} onEdit={() => applyAiDraft(true)} onDismiss={() => setDecision("dismissed")} /> : undefined}
            >
              {ai.isFetching && !ai.data ? (
                <Analyzing steps={["Loading image series", "Detecting regions of interest", "Comparing with normal anatomy", "Drafting impression"]} />
              ) : ai.data ? (
                <div className="space-y-3 p-4 text-sm">
                  {ai.data.findings.length === 0 ? (
                    <p className="text-muted-foreground">No focal abnormality detected by the model.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {ai.data.findings.map((f) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            onMouseEnter={() => setActive(f.id)}
                            onMouseLeave={() => setActive(undefined)}
                            onFocus={() => setActive(f.id)}
                            onBlur={() => setActive(undefined)}
                            className={cn("grid w-full gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors", active === f.id ? "border-primary/50 bg-info-soft/40" : "hover:bg-muted/50")}
                          >
                            <span className="flex items-center gap-2">
                              <span className="num text-xs text-muted-foreground">{f.id}</span>
                              <span className="font-medium">{f.label}</span>
                              <StatusBadge tone={f.severity} className="ml-auto">
                                {Math.round(f.confidence * 100)}%
                              </StatusBadge>
                            </span>
                            <span className="text-[13px] text-muted-foreground">{f.description}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Draft impression</p>
                    <p>{ai.data.draftImpression}</p>
                  </div>
                </div>
              ) : null}
            </AiPanel>
          )}

          <Panel title="Report" description={o.report ? `${o.report.verified ? "Verified" : "Preliminary"} · ${o.report.reportedBy} · ${dateTime(o.report.reportedAt)}` : undefined}>
            {canReport ? (
              <form
                className="grid gap-3 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate(false);
                }}
              >
                <TextareaField label="Technique" rows={2} value={technique} onChange={(e) => setDraft((d) => ({ ...d, technique: e.target.value }))} />
                <TextareaField label="Findings" rows={6} value={findingsText} onChange={(e) => setDraft((d) => ({ ...d, findings: e.target.value }))} required />
                <TextareaField ref={impressionRef} label="Impression" rows={3} value={impression} onChange={(e) => setDraft((d) => ({ ...d, impression: e.target.value }))} required />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="submit" variant="outline" disabled={!ready || save.isPending}>
                    <Check /> Save preliminary
                  </Button>
                  <Button type="button" onClick={() => save.mutate(true)} disabled={!ready || save.isPending}>
                    {save.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify and sign
                  </Button>
                </div>
              </form>
            ) : o.report ? (
              <div className="space-y-3 p-4 text-sm">
                <ReportBlock label="Technique" text={o.report.technique} />
                <ReportBlock label="Findings" text={o.report.findings} />
                <ReportBlock label="Impression" text={o.report.impression} strong />
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{acquired ? "Awaiting report from radiology." : "Report available after acquisition."}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ReportBlock({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn("whitespace-pre-line", strong && "font-medium")}>{text}</p>
    </div>
  );
}
