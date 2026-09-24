import type { HospitalProfile } from "@/types";
import { mock, ServiceError } from "./http";
import { db } from "./mappers";

export const settingsService = {
  getHospital(): Promise<HospitalProfile> {
    return mock(() => db().hospital, { min: 80, max: 180 });
  },

  updateHospital(patch: Partial<HospitalProfile>): Promise<HospitalProfile> {
    return mock(() => {
      if (patch.gstin !== undefined && !/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z0-9]$/.test(patch.gstin)) throw new ServiceError("GSTIN must be 15 characters, e.g. 29AAJCM4821K1Z6");
      Object.assign(db().hospital, patch);
      return db().hospital;
    });
  },
};
