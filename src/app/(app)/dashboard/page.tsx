"use client";

import { format } from "date-fns";
import { PageHeader } from "@/components/layout/page";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useHydrated } from "@/hooks/use-hydrated";
import { ROLE_PERSONA } from "@/lib/rbac";
import {
  ActivityFeed,
  AlertsPanel,
  AppointmentsToday,
  ClaimsAtRisk,
  CollectionsByMode,
  DoctorQueue,
  ErSnapshot,
  KpiRow,
  LabPipeline,
  LabTatTrend,
  MarDue,
  MyInpatients,
  OccupancyByWard,
  OccupancyForecast,
  OpdTrend,
  PendingPrescriptions,
  QuickActions,
  RevenueStreams,
  StockForecast,
  WardWatchlist,
} from "@/features/dashboard/widgets";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { role, user } = useCurrentUser();
  const hydrated = useHydrated();
  const first = user?.name.replace(/^Dr\.\s*/, "").split(" ")[0];
  const nurseWard = ROLE_PERSONA.Nurse.wardId!;

  return (
    <div className="space-y-5">
      <PageHeader
        title={hydrated && user ? `${greeting()}, ${role === "Doctor" ? `Dr. ${first}` : first}` : "Dashboard"}
        description={hydrated ? `${format(new Date(), "EEEE, d MMMM yyyy")} · ${ROLE_PERSONA[role].title}` : "\u00a0"}
      />
      <KpiRow role={role} />

      {role === "Admin" && (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <OccupancyForecast />
            </div>
            <AlertsPanel role={role} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <OpdTrend />
            <RevenueStreams />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <OccupancyByWard />
            <ErSnapshot />
            <ActivityFeed />
          </div>
        </>
      )}

      {role === "Doctor" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <DoctorQueue />
            <MyInpatients doctorId={ROLE_PERSONA.Doctor.doctorId} />
          </div>
          <div className="space-y-4">
            <AlertsPanel role={role} />
            <ActivityFeed />
          </div>
        </div>
      )}

      {role === "Nurse" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <WardWatchlist wardId={nurseWard} />
            <MarDue wardId={nurseWard} />
          </div>
          <div className="space-y-4">
            <AlertsPanel role={role} />
            <ActivityFeed />
          </div>
        </div>
      )}

      {role === "Receptionist" && (
        <>
          <QuickActions />
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <AppointmentsToday />
            </div>
            <ActivityFeed />
          </div>
        </>
      )}

      {role === "Lab Technician" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <LabPipeline />
            <LabTatTrend />
          </div>
          <div className="space-y-4">
            <AlertsPanel role={role} />
            <ActivityFeed />
          </div>
        </div>
      )}

      {role === "Pharmacist" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <PendingPrescriptions />
          <StockForecast />
          <AlertsPanel role={role} className="xl:col-span-2" />
        </div>
      )}

      {role === "Billing" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <ClaimsAtRisk />
          <CollectionsByMode />
          <AlertsPanel role={role} />
          <ActivityFeed />
        </div>
      )}
    </div>
  );
}
