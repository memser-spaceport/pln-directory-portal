export class UpsertTeamFundraisingDto {
  focusAreaUid?: string | null;
  fundingStageUid?: string | null;
  onePagerUrl?: string | null;
  videoUrl?: string | null;
}

export class ChangeStatusDto {
  status!: 'DISABLED' | 'DRAFT' | 'PUBLISHED';
}
