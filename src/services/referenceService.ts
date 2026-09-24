import { ICD10, type Icd10Code } from "@/data/reference/icd10";
import { mock } from "./http";

export type { Icd10Code };

/** Terminology lookups. In production: an ICD-10 / SNOMED terminology server. */
export const referenceService = {
  searchIcd10(query: string, limit = 12): Promise<Icd10Code[]> {
    return mock(
      () => {
        const q = query.trim().toLowerCase();
        if (!q) return ICD10.slice(0, limit);
        const terms = q.split(/\s+/);
        const scored = ICD10.map((c) => {
          const hay = `${c.code} ${c.name}`.toLowerCase();
          if (!terms.every((t) => hay.includes(t))) return undefined;
          const score = c.code.toLowerCase().startsWith(q) ? 0 : c.name.toLowerCase().startsWith(q) ? 1 : 2;
          return { c, score };
        }).filter((x): x is { c: Icd10Code; score: number } => Boolean(x));
        return scored.sort((a, b) => a.score - b.score || a.c.code.localeCompare(b.c.code)).slice(0, limit).map((x) => x.c);
      },
      { min: 60, max: 140 },
    );
  },
};
