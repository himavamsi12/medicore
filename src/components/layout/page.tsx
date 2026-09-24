import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 pb-5 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((b, i) => (
              <span key={`${b.label}-${i}`} className="flex items-center gap-1">
                {b.href ? (
                  <Link href={b.href} className="rounded-sm hover:text-foreground">
                    {b.label}
                  </Link>
                ) : (
                  <span aria-current="page">{b.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <ChevronRight className="size-3" aria-hidden />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-balance md:text-[22px]">{title}</h1>
        {description && <p className="max-w-[70ch] text-sm text-muted-foreground">{description}</p>}
        {meta && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Bordered surface with an optional header row. The one card primitive for panels. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground", className)} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="truncate text-sm font-medium">
                {title}
              </h2>
            )}
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Label / value pair for detail views. */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{children ?? <span className="text-subtle-foreground">Not recorded</span>}</dd>
    </div>
  );
}
