"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, Loader2, Plus, Trash2 } from "lucide-react";
import type { NewPatientInput } from "@/types";
import { billingService } from "@/services/billingService";
import { patientService } from "@/services/patientService";
import { ChoiceChips, FormSection, SelectField, TextField } from "@/components/forms/fields";
import { PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/lib/constants";

const STATES = ["Karnataka", "Tamil Nadu", "Kerala", "Andhra Pradesh", "Telangana", "Maharashtra", "Goa", "Delhi", "West Bengal", "Uttar Pradesh", "Gujarat", "Rajasthan", "Punjab", "Odisha", "Bihar", "Madhya Pradesh"];
const LANGUAGES = ["Kannada", "English", "Hindi", "Tamil", "Telugu", "Malayalam", "Urdu", "Marathi", "Bengali"];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const RELATIONS = ["Spouse", "Wife", "Husband", "Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Friend", "Guardian"];

const mobile = z
  .string()
  .transform((v) => v.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))
  .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a 10-digit Indian mobile number starting with 6-9");

const schema = z
  .object({
    firstName: z.string().trim().min(2, "Enter the first name"),
    lastName: z.string().trim().min(1, "Enter the last name"),
    gender: z.enum(["Male", "Female", "Other"], { message: "Select a gender" }),
    dob: z
      .string()
      .min(1, "Enter the date of birth")
      .refine((v) => new Date(v) <= new Date(), "Date of birth cannot be in the future"),
    bloodGroup: z.enum(BLOOD, { message: "Select a blood group" }),
    phone: mobile,
    email: z.union([z.literal(""), z.email("Enter a valid email")]).optional(),
    abhaNumber: z
      .string()
      .optional()
      .refine((v) => !v || v.replace(/\D/g, "").length === 14, "ABHA number has 14 digits"),
    line1: z.string().trim().min(3, "Enter the address"),
    city: z.string().trim().min(2, "Enter the city"),
    state: z.string().min(1, "Select a state"),
    pincode: z.string().regex(/^[1-9]\d{5}$/, "PIN code has 6 digits"),
    maritalStatus: z.enum(["Single", "Married", "Widowed", "Divorced"]),
    occupation: z.string().optional(),
    preferredLanguage: z.string().min(1),
    ecName: z.string().trim().min(2, "Enter a contact name"),
    ecRelation: z.string().min(1, "Select the relation"),
    ecPhone: mobile,
    allergies: z.array(
      z.object({
        substance: z.string().trim().min(2, "Enter the substance"),
        category: z.enum(["Drug", "Food", "Environmental"]),
        reaction: z.string().trim().min(2, "Describe the reaction"),
        severity: z.enum(["Mild", "Moderate", "Severe"]),
      }),
    ),
    paymentCategory: z.enum(["Self-pay", "Insurance", "Corporate", "PMJAY", "CGHS"]),
    payerId: z.string().optional(),
    policyNo: z.string().optional(),
    validTill: z.string().optional(),
    sumInsured: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.paymentCategory === "Self-pay") return;
    if (!v.payerId) ctx.addIssue({ code: "custom", path: ["payerId"], message: "Select the insurer or scheme" });
    if (!v.policyNo?.trim()) ctx.addIssue({ code: "custom", path: ["policyNo"], message: "Enter the policy or card number" });
    if (!v.validTill) ctx.addIssue({ code: "custom", path: ["validTill"], message: "Enter the validity date" });
    else if (new Date(v.validTill) < new Date()) ctx.addIssue({ code: "custom", path: ["validTill"], message: "Policy has expired" });
  });

type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

const fmtPhone = (d: string) => `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
const fmtAbha = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].filter(Boolean).join("-");
};

export default function RegisterPatientPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [abhaState, setAbhaState] = useState<{ status: "idle" | "checking" | "ok" | "fail"; message?: string }>({ status: "idle" });

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: { maritalStatus: "Married", preferredLanguage: "Kannada", state: "Karnataka", city: "Bengaluru", paymentCategory: "Self-pay", allergies: [], email: "", abhaNumber: "" },
    mode: "onTouched",
  });
  const { register, handleSubmit, control, setValue, formState } = form;
  const errors = formState.errors;
  const allergies = useFieldArray({ control, name: "allergies" });
  const [gender, paymentCategory, phone, abha] = useWatch({ control, name: ["gender", "paymentCategory", "phone", "abhaNumber"] });

  const phoneDigits = (phone ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  const dupes = useQuery({ queryKey: ["patient-dupes", phoneDigits], queryFn: () => patientService.search(phoneDigits, 3), enabled: /^[6-9]\d{9}$/.test(phoneDigits) });
  const payers = useQuery({ queryKey: ["payers"], queryFn: () => billingService.getPayers(), staleTime: Infinity });
  const payerOptions = (payers.data ?? []).filter((p) =>
    paymentCategory === "Insurance" ? p.kind === "Insurer" : paymentCategory === "Corporate" ? p.kind === "Corporate" : paymentCategory === "PMJAY" ? p.id === "PAY-PMJAY" : paymentCategory === "CGHS" ? p.id === "PAY-CGHS" : false,
  );

  const create = useMutation({
    mutationFn: (input: NewPatientInput) => patientService.create(input),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(`${p.fullName} registered`, { description: `UHID ${p.uhid}` });
      router.push(`/patients/${p.id}`);
    },
    onError: (e) => toast.error("Registration failed", { description: e instanceof Error ? e.message : undefined }),
  });

  const onSubmit = (v: FormOut) => {
    const payer = payers.data?.find((p) => p.id === v.payerId);
    create.mutate({
      firstName: v.firstName,
      lastName: v.lastName,
      gender: v.gender,
      dob: v.dob,
      bloodGroup: v.bloodGroup,
      phone: fmtPhone(v.phone),
      email: v.email || undefined,
      abhaNumber: v.abhaNumber ? fmtAbha(v.abhaNumber) : undefined,
      address: { line1: v.line1, city: v.city, state: v.state, pincode: v.pincode },
      maritalStatus: v.maritalStatus,
      occupation: v.occupation,
      preferredLanguage: v.preferredLanguage,
      emergencyContact: { name: v.ecName, relation: v.ecRelation, phone: fmtPhone(v.ecPhone) },
      allergies: v.allergies,
      paymentCategory: v.paymentCategory,
      insurance: v.paymentCategory === "Self-pay" || !v.payerId ? undefined : { payerId: v.payerId, payerName: payer?.shortName, policyNo: v.policyNo ?? "", validTill: v.validTill ?? "", sumInsured: Number(v.sumInsured || 0) },
    });
  };

  const verifyAbha = async () => {
    setAbhaState({ status: "checking" });
    const r = await patientService.verifyAbha(abha ?? "");
    setAbhaState({ status: r.verified ? "ok" : "fail", message: r.message });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Register patient" description="Creates a UHID. Link ABHA to pull records from other ABDM facilities." breadcrumbs={[{ label: "Patients", href: "/patients" }, { label: "Register" }]} />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="rounded-xl border bg-card p-5 md:p-7">
        <FormSection title="Identity" description="As on Aadhaar or other government ID.">
          <TextField label="First name" required autoComplete="given-name" error={errors.firstName?.message} {...register("firstName")} />
          <TextField label="Last name" required autoComplete="family-name" error={errors.lastName?.message} {...register("lastName")} />
          <ChoiceChips label="Gender" value={gender} onChange={(g) => setValue("gender", g, { shouldValidate: true })} options={["Male", "Female", "Other"] as const} error={errors.gender?.message} />
          <TextField label="Date of birth" type="date" required max={new Date().toISOString().slice(0, 10)} error={errors.dob?.message} {...register("dob")} />
          <SelectField label="Blood group" required placeholder="Select" options={[...BLOOD]} error={errors.bloodGroup?.message} {...register("bloodGroup")} />
          <SelectField label="Marital status" options={["Single", "Married", "Widowed", "Divorced"]} {...register("maritalStatus")} />
          <div className="sm:col-span-2">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField
                label="ABHA number"
                hint="Ayushman Bharat Health Account, 14 digits (optional)"
                inputMode="numeric"
                placeholder="91-XXXX-XXXX-XXXX"
                error={errors.abhaNumber?.message}
                {...register("abhaNumber", {
                  onChange: (e) => {
                    e.target.value = fmtAbha(e.target.value);
                    setAbhaState({ status: "idle" });
                  },
                })}
              />
              <Button type="button" variant="outline" className="h-9" disabled={!abha || abha.replace(/\D/g, "").length !== 14 || abhaState.status === "checking"} onClick={verifyAbha}>
                {abhaState.status === "checking" ? <Loader2 className="animate-spin" /> : <BadgeCheck strokeWidth={ICON_STROKE} />} Verify with ABDM
              </Button>
            </div>
            {abhaState.message && (
              <p role="status" className={abhaState.status === "ok" ? "mt-1.5 text-xs text-stable-fg" : "mt-1.5 text-xs text-critical-fg"}>
                {abhaState.message}
              </p>
            )}
          </div>
        </FormSection>

        <FormSection title="Contact" description="Mobile number is used for appointment SMS and OTP.">
          <TextField label="Mobile number" required prefix="+91" inputMode="tel" autoComplete="tel-national" placeholder="98452 17306" error={errors.phone?.message} {...register("phone")} />
          <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
          {(dupes.data?.length ?? 0) > 0 && (
            <div role="alert" className="flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm sm:col-span-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-fg" />
              <div>
                <p className="font-medium text-warning-fg">Possible duplicate registration</p>
                <p className="text-xs text-muted-foreground">This mobile number is already registered to:</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {dupes.data!.map((d) => (
                    <li key={d.id}>
                      <Link className="font-medium underline underline-offset-2" href={`/patients/${d.id}`}>
                        {d.fullName}
                      </Link>{" "}
                      · {d.uhid} · {d.ageLabel} {d.gender[0]}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <TextField label="Address" required wrapperClassName="sm:col-span-2" autoComplete="street-address" error={errors.line1?.message} {...register("line1")} />
          <TextField label="City" required autoComplete="address-level2" error={errors.city?.message} {...register("city")} />
          <SelectField label="State" required options={STATES} error={errors.state?.message} {...register("state")} />
          <TextField label="PIN code" required inputMode="numeric" maxLength={6} autoComplete="postal-code" error={errors.pincode?.message} {...register("pincode")} />
          <SelectField label="Preferred language" options={LANGUAGES} {...register("preferredLanguage")} />
          <TextField label="Occupation" {...register("occupation")} />
        </FormSection>

        <FormSection title="Emergency contact">
          <TextField label="Name" required error={errors.ecName?.message} {...register("ecName")} />
          <SelectField label="Relation" required placeholder="Select" options={RELATIONS} error={errors.ecRelation?.message} {...register("ecRelation")} />
          <TextField label="Mobile number" required prefix="+91" inputMode="tel" error={errors.ecPhone?.message} {...register("ecPhone")} />
        </FormSection>

        <FormSection title="Allergies" description="Drug allergies drive prescription safety checks. Record none if not known.">
          <div className="space-y-3 sm:col-span-2">
            {allergies.fields.length === 0 && <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">No known allergies recorded.</p>}
            {allergies.fields.map((f, i) => (
              <div key={f.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1.2fr_1fr_1.4fr_1fr_auto] sm:items-end">
                <TextField label="Substance" required error={errors.allergies?.[i]?.substance?.message} {...register(`allergies.${i}.substance`)} />
                <SelectField label="Type" options={["Drug", "Food", "Environmental"]} {...register(`allergies.${i}.category`)} />
                <TextField label="Reaction" required error={errors.allergies?.[i]?.reaction?.message} {...register(`allergies.${i}.reaction`)} />
                <SelectField label="Severity" options={["Mild", "Moderate", "Severe"]} {...register(`allergies.${i}.severity`)} />
                <Button type="button" variant="ghost" size="icon" className="h-9" aria-label={`Remove allergy ${i + 1}`} onClick={() => allergies.remove(i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => allergies.append({ substance: "", category: "Drug", reaction: "", severity: "Moderate" })}>
              <Plus /> Add allergy
            </Button>
          </div>
        </FormSection>

        <FormSection title="Payment" description="Insurance and scheme details are verified by the TPA desk at admission.">
          <div className="sm:col-span-2">
            <ChoiceChips label="Payment category" value={paymentCategory} onChange={(v) => setValue("paymentCategory", v, { shouldValidate: true })} options={["Self-pay", "Insurance", "Corporate", "PMJAY", "CGHS"] as const} />
          </div>
          {paymentCategory && paymentCategory !== "Self-pay" && (
            <>
              <SelectField label={paymentCategory === "Insurance" ? "Insurer" : "Scheme or employer"} required placeholder="Select" options={payerOptions.map((p) => ({ value: p.id, label: p.name }))} error={errors.payerId?.message} {...register("payerId")} />
              <TextField label="Policy or card number" required error={errors.policyNo?.message} {...register("policyNo")} />
              <TextField label="Valid till" type="date" required error={errors.validTill?.message} {...register("validTill")} />
              <TextField label="Sum insured (₹)" inputMode="numeric" {...register("sumInsured")} />
            </>
          )}
        </FormSection>

        <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" render={<Link href="/patients" />} nativeButton={false}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Register and create UHID
          </Button>
        </div>
      </form>
    </div>
  );
}
