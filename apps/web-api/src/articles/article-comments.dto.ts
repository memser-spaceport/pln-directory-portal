export class CreateArticleCommentDto {
  content!: string;
  parentUid?: string;
}

export class UpdateArticleCommentDto {
  content!: string;
}
