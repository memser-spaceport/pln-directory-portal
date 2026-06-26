export class WarmIntroPlMemberFacetDto {
  name!: string;
  memberUid?: string;
  count!: number;
}

export class WarmIntroFounderTeamFacetDto {
  name!: string;
  teamUid?: string;
}

export class WarmIntroFounderFacetDto {
  name!: string;
  memberUid?: string;
  role?: string;
  teams?: WarmIntroFounderTeamFacetDto[];
  count!: number;
}

export class WarmIntroFacetsResponseDto {
  plMembers!: WarmIntroPlMemberFacetDto[];
  founders!: WarmIntroFounderFacetDto[];
}
