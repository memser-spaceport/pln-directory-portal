export type SelfUpdatePayload = {
  // allowed for any user:
  memberUid?: string;
  role?: string | null;
  investmentTeam: boolean;

  // allowed only for team lead:
  isFund?: boolean | false;
  investorProfile?: {
    investmentFocus?: string[];
    investInStartupStages?: string[];
    investInFundTypes?: string[];
    typicalCheckSize?: number | null;
  } | null;
};


export class UpdateTeamAccessLevelDto {
  accessLevel: string;
}
