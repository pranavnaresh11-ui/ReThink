export type LocationTag = 'SCHOOL' | 'HOME' | 'SOCIAL' | 'OTHER';
export type Outcome = 'RESISTED' | 'RELAPSED';
export type CravingLevel = 0 | 1 | 2;

export const LOCATIONS: LocationTag[] = ['SCHOOL', 'HOME', 'SOCIAL', 'OTHER'];
export const LOCATION_LABELS: Record<LocationTag, string> = {
  SCHOOL: 'School',
  HOME: 'Home',
  SOCIAL: 'Social',
  OTHER: 'Other',
};

export interface CravingEvent {
  id: number;
  at: number;
  /** Self-reported 1–5, if the user gave one. */
  stress: number | null;
  location: LocationTag;
  predictedRisk: number;
  outcome: Outcome;
  interventionCompleted: boolean;
}

export interface CheckIn {
  id: number;
  at: number;
  /** 1–5 */
  stress: number;
  location: LocationTag;
  cravingNow: CravingLevel;
}

/** Everything the prediction engine needs. Arrays are sorted oldest → newest. */
export interface History {
  trackingStart: number;
  /** Last nicotine use before the quit attempt began. */
  quitStart: number;
  /** Baseline dependence F0, normalised 0..1. */
  dependence: number;
  cravings: CravingEvent[];
  checkIns: CheckIn[];
}
