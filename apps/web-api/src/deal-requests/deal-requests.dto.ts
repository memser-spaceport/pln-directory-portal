export class CreateDealRequestDto {
  dealUid?: string;
  description?: string;
  whatDealAreYouLookingFor!: string;
  howToReachOutToYou?: string;
}

export class UpdateDealRequestDto {
  description?: string;
  whatDealAreYouLookingFor?: string;
  howToReachOutToYou?: string;
}

export class ListDealRequestsQueryDto {
  page?: number = 1;
  limit?: number = 20;
  dealUid?: string;
  requestedByUserUid?: string;
  search?: string;
}
