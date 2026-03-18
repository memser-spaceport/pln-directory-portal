import { DealStatus } from '@prisma/client';

export class ListDealsQueryDto {
  page?: number = 1;
  limit?: number = 20;
  search?: string;
  category?: string;
  audience?: string;
  sort?: 'alphabetical' | 'mostRecent' = 'mostRecent';
}

export class UpsertDealDto {
  vendorName!: string;
  vendorTeamUid?: string;
  logoUid?: string | null;
  category!: string;
  audience!: string;
  shortDescription!: string;
  fullDescription!: string;
  redemptionInstructions!: string;
  status?: DealStatus;
}

export class UpdateDealAccessDto {
  memberUid!: string;
}
