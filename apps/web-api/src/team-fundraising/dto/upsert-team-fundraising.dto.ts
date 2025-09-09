export class UpsertTeamFundraisingDto {
  focusAreaUid?: string | null;
  fundingStageUid?: string | null;

  onePagerUploadUid?: string | null;
  videoUploadUid?: string | null;
}

export class ChangeStatusDto {
  status!: 'DISABLED' | 'DRAFT' | 'PUBLISHED';
}
