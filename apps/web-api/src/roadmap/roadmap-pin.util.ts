export interface AdminPinRow {
  uid: string;
  note: string | null;
  impact: number | null;
  createdAt: Date;
  releasedAt: Date | null;
  member: { uid: string; name: string; image: { url: string } | null };
}

export interface AdminPinDto {
  uid: string;
  note: string | null;
  impact: number | null;
  createdAt: string;
  releasedAt: string | null;
  member: { uid: string; name: string; imageUrl: string | null };
}

export type ImpactDistribution = { 1: number; 2: number; 3: number; 4: number; 5: number };

export function emptyImpactDistribution(): ImpactDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/** Aggregates author + pin impact values (1–5); null impacts are ignored. */
export function computeImpactAggregate(values: Array<number | null | undefined>): {
  impactCount: number;
  avgImpact: number | null;
  impactDistribution: ImpactDistribution;
} {
  const impactDistribution = emptyImpactDistribution();
  let total = 0;
  let impactCount = 0;
  for (const value of values) {
    if (value == null || value < 1 || value > 5) continue;
    const level = value as 1 | 2 | 3 | 4 | 5;
    impactDistribution[level] += 1;
    total += value;
    impactCount += 1;
  }
  return {
    impactCount,
    avgImpact: impactCount > 0 ? total / impactCount : null,
    impactDistribution,
  };
}

/** Pin impacts that count toward aggregates: active while pinnable; all (incl. released) when frozen. */
export function impactValuesFromPins(
  pins: Array<{ impact: number | null; releasedAt: Date | null }>,
  pinnable: boolean
): number[] {
  const relevant = pinnable ? pins.filter((pin) => !pin.releasedAt) : pins;
  return relevant.map((pin) => pin.impact).filter((impact): impact is number => impact != null);
}

/** Maps pin rows to the admin-facing DTO list: active pins first, then most recent. */
export function toAdminPinList(pins: AdminPinRow[]): AdminPinDto[] {
  return [...pins]
    .sort((a, b) => {
      if (!a.releasedAt !== !b.releasedAt) return a.releasedAt ? 1 : -1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((pin) => ({
      uid: pin.uid,
      note: pin.note,
      impact: pin.impact,
      createdAt: pin.createdAt.toISOString(),
      releasedAt: pin.releasedAt?.toISOString() ?? null,
      member: { uid: pin.member.uid, name: pin.member.name, imageUrl: pin.member.image?.url ?? null },
    }));
}
