"use client";

import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

/** Label above, control, helper text, error below. Wires aria-describedby / aria-invalid. */
export function FieldShell({ label, hint, error, required, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
        {required && (
          <span className="text-critical-fg" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs text-critical-fg" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; wrapperClassName?: string; prefix?: string };

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField({ label, hint, error, required, wrapperClassName, className, prefix, ...rest }, ref) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) =>
        prefix ? (
          <div className="flex">
            <span className="flex h-9 items-center rounded-l-lg border border-r-0 border-input bg-muted px-2.5 text-sm text-muted-foreground">{prefix}</span>
            <input ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required} className={cn(control, "h-9 rounded-l-none", className)} {...rest} />
          </div>
        ) : (
          <input ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required} className={cn(control, "h-9", className)} {...rest} />
        )
      }
    </FieldShell>
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string; wrapperClassName?: string; options: (string | { value: string; label: string })[]; placeholder?: string };

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField({ label, hint, error, required, wrapperClassName, className, options, placeholder, ...rest }, ref) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required} className={cn(control, "h-9 appearance-none pr-8", className)} {...rest}>
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((o) => {
              const v = typeof o === "string" ? { value: o, label: o } : o;
              return (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              );
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>
      )}
    </FieldShell>
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string; wrapperClassName?: string };

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextareaField({ label, hint, error, required, wrapperClassName, className, ...rest }, ref) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => <textarea ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={cn(control, "min-h-20 py-2 leading-relaxed", className)} {...rest} />}
    </FieldShell>
  );
});

/** Titled group of fields inside a form. */
export function FormSection({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("grid gap-4 border-t py-6 first:border-t-0 first:pt-0 md:grid-cols-[220px_1fr] md:gap-8", className)}>
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ChoiceChips<T extends string>({ label, value, onChange, options, error }: { label: string; value?: T; onChange: (v: T) => void; options: readonly T[]; error?: string }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-[13px] font-medium">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn("h-8 rounded-lg border px-3 text-sm transition-colors hover:border-border-strong focus-visible:outline-2", value === o ? "border-primary bg-info-soft font-medium text-info-fg" : "bg-card")}
          >
            {o}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-critical-fg" role="alert">{error}</p>}
    </div>
  );
}
