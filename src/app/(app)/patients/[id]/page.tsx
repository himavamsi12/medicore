"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, CalendarPlus, Printer, UserX } from "lucide-react";
import { patientService } from "@/services/patientService";
import { EmptyState, ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { TabPanel, UrlTabs, useUrlTab, type TabDef } from "@/components/layout/url-tabs";
import { Button } from "@/components/ui/button";
import { AdmissionsTab, BillingTab, DocumentsTab, LabsTab, MedicationsPanel, OverviewTab, PatientBanner, TimelineTab, VitalsTab } from "@/features/patients/profile";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can, canAccess } from "@/lib/rbac";
import { useUi } from "@/stores/ui";

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "vitals", label: "Vitals" },
  { id: "labs", label: "Labs" },
  { id: "medications", label: "Medications" },
  { id: "admissions", label: "Admissions" },
  { id: "documents", label: "Documents" },
  { id: "billing", label: "Billing" },
];

export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useCurrentUser();
  const tab = useUrlTab(TABS);
  const pushRecent = useUi((s) => s.pushRecentPatient);
  const q = useQuery({ queryKey: ["patient", id], queryFn: () => patientService.getById(id) });

  useEffect(() => {
    if (q.data) pushRecent({ id: q.data.id, name: q.data.fullName, uhid: q.data.uhid });
  }, [q.data, pushRecent]);

  if (q.isLoading)
    return (
      <div className="space-y-4">
        <PanelSkeleton lines={4} className="rounded-xl border" />
        <PanelSkeleton lines={10} className="rounded-xl border" />
      </div>
    );
  if (q.error) {
    const notFound = q.error instanceof Error && q.error.message.includes("not found");
    return notFound ? <EmptyState icon={UserX} title="Patient not found" description="The UHID may have been merged or mistyped." action={<Button variant="outline" render={<Link href="/patients" />} nativeButton={false}>Back to patients</Button>} /> : <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  const p = q.data!;
  const clinical = can(role, "patient.viewClinical");
  const visibleTabs = clinical ? TABS : TABS.filter((t) => ["overview", "documents", "billing", "admissions"].includes(t.id));

  return (
    <div className="space-y-4">
      <PatientBanner
        p={p}
        actions={
          <>
            {canAccess(role, "/opd/appointments") && (
              <Button variant="outline" size="sm" render={<Link href={`/opd/appointments?book=1&patient=${p.id}`} />} nativeButton={false}>
                <CalendarPlus /> Book visit
              </Button>
            )}
            {!p.activeAdmission && can(role, "admission.manage") && (
              <Button variant="outline" size="sm" render={<Link href={`/ipd/beds?admit=${p.id}`} />} nativeButton={false}>
                <BedDouble /> Admit
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </>
        }
      />
      <UrlTabs tabs={visibleTabs} label="Patient record sections" />
      <TabPanel id={tab}>
        {tab === "overview" && (clinical ? <OverviewTab p={p} /> : <MedicationsPanel patientId={p.id} />)}
        {tab === "timeline" && <TimelineTab patientId={p.id} />}
        {tab === "vitals" && <VitalsTab patientId={p.id} />}
        {tab === "labs" && <LabsTab patientId={p.id} />}
        {tab === "medications" && <MedicationsPanel patientId={p.id} />}
        {tab === "admissions" && <AdmissionsTab patientId={p.id} />}
        {tab === "documents" && <DocumentsTab patientId={p.id} />}
        {tab === "billing" && <BillingTab patientId={p.id} />}
      </TabPanel>
    </div>
  );
}
