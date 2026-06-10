export interface AdminPinRow {
  uid: string;
  note: string | null;
  createdAt: Date;
  releasedAt: Date | null;
  member: { uid: string; name: string; image: { url: string } | null };
}

export interface AdminPinDto {
  uid: string;
  note: string | null;
  createdAt: string;
  releasedAt: string | null;
  member: { uid: string; name: string; imageUrl: string | null };
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
      createdAt: pin.createdAt.toISOString(),
      releasedAt: pin.releasedAt?.toISOString() ?? null,
      member: { uid: pin.member.uid, name: pin.member.name, imageUrl: pin.member.image?.url ?? null },
    }));
}
