/** Members marked with an inactive email keep it in storage, but only they and directory admins receive it. */
export function presentEmailForViewer<T extends Record<string, unknown>>(member: T, canSee: boolean): T {
  if (!member || !member.hasInactiveEmail || canSee) {
    return member;
  }
  return { ...member, email: null };
}
