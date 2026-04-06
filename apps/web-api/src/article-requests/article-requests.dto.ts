export class CreateArticleRequestDto {
  articleUid?: string;
  title!: string;
  description?: string;
}

export class UpdateArticleRequestDto {
  title?: string;
  description?: string;
}

export class ListArticleRequestsQueryDto {
  page?: number = 1;
  limit?: number = 20;
  articleUid?: string;
  requestedByUserUid?: string;
  search?: string;
}
