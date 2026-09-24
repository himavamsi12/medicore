"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import type { Diagnosis, ScribeResult, SoapNote } from "@/types";
import { aiService } from "@/services/aiService";
import { AiPanel, Analyzing, ReviewBar, type ReviewDecision } from "@/components/ai/ai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Phase = "idle" | "recording" | "processing" | "ready";

/**
 * AI Scribe (mocked). "Recording" plays back a scripted transcript line by
 * line; stopping produces a structured SOAP note the doctor must review
 * before it is applied to the consultation.
 */
export function AiScribe({ appointmentId, onApply }: { appointmentId: string; onApply: (soap: SoapNote, diagnoses: Diagnosis[]) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ScribeResult>();
  const [shown, setShown] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [decision, setDecision] = useState<ReviewDecision>();
  const pending = useRef<Promise<ScribeResult> | undefined>(undefined);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    const l = setInterval(() => setShown((n) => n + 1), 1600);
    return () => {
      clearInterval(t);
      clearInterval(l);
    };
  }, [phase]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [shown]);

  const start = () => {
    setDecision(undefined);
    setSeconds(0);
    setShown(1);
    setPhase("recording");
    pending.current = aiService.scribeConsultation(appointmentId).then((r) => {
      setResult(r);
      return r;
    });
  };
  const stop = async () => {
    setPhase("processing");
    const r = await pending.current;
    await new Promise((res) => setTimeout(res, 1200));
    if (r) setResult(r);
    setPhase("ready");
  };

  const transcript = result?.transcript ?? [];
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <AiPanel title="AI scribe" meta={phase === "ready" ? result?.meta : undefined}>
      {phase === "idle" && (
        <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Record the consultation with the patient&apos;s consent. The scribe drafts a SOAP note for your review.</p>
          <Button onClick={start} className="shrink-0">
            <Mic /> Record consultation
          </Button>
        </div>
      )}
      {phase === "recording" && (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-critical opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-3 rounded-full bg-critical" />
            </span>
            <span className="text-sm font-medium">Recording</span>
            <span className="num text-sm text-muted-foreground">
              {mm}:{ss}
            </span>
            <span aria-hidden className="flex h-5 items-end gap-0.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} className="w-1 animate-pulse rounded-full bg-info motion-reduce:animate-none" style={{ height: `${30 + ((i * 37 + seconds * 13) % 70)}%`, animationDelay: `${i * 80}ms` }} />
              ))}
            </span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={stop}>
              <Square /> Stop and draft note
            </Button>
          </div>
          <ol ref={listRef} className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm scrollbar-thin" aria-live="polite" aria-label="Live transcript">
            {transcript.length === 0 && <li className="text-xs text-muted-foreground">Listening…</li>}
            {transcript.slice(0, shown).map((l, i) => (
              <li key={i}>
                <span className={cn("mr-1.5 text-xs font-medium", l.speaker === "Doctor" ? "text-info-fg" : "text-muted-foreground")}>{l.speaker}</span>
                {l.text}
              </li>
            ))}
          </ol>
        </div>
      )}
      {phase === "processing" && <Analyzing label="Drafting SOAP note" steps={["Separating speakers", "Extracting symptoms and history", "Adding recorded vitals", "Structuring assessment and plan"]} />}
      {phase === "ready" && result && (
        <div className="space-y-3 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
              <div key={k} className="rounded-lg border p-3">
                <dt className="mb-1 text-xs font-semibold text-muted-foreground capitalize">{k}</dt>
                <dd className="leading-relaxed">{result.soap[k]}</dd>
              </div>
            ))}
          </dl>
          {result.suggestedDiagnoses.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Suggested diagnoses: <span className="text-foreground">{result.suggestedDiagnoses.map((d) => `${d.name} (${d.code})`).join(", ")}</span>
            </p>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Transcript ({result.transcript.length} turns)</summary>
            <ol className="mt-2 space-y-1">
              {result.transcript.map((l, i) => (
                <li key={i}>
                  <span className="font-medium">{l.speaker}:</span> {l.text}
                </li>
              ))}
            </ol>
          </details>
          <ReviewBar
            decision={decision}
            acceptLabel="Apply to note"
            onAccept={() => {
              onApply(result.soap, result.suggestedDiagnoses);
              setDecision("accepted");
            }}
            onEdit={() => {
              onApply(result.soap, []);
              setDecision("edited");
            }}
            onDismiss={() => setDecision("dismissed")}
          />
        </div>
      )}
    </AiPanel>
  );
}
