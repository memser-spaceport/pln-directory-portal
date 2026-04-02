import { ArticleStatus } from '@prisma/client';

export class ListArticlesQueryDto {
  page?: number = 1;
  limit?: number = 20;
  search?: string;
  category?: string;
  sort?: 'mostRecent' | 'mostViewed' | 'alphabetical' = 'mostRecent';
}

export class CreateArticleDto {
  title!: string;
  slugURL?: string;
  summary!: string;
  category!: string;
  tags?: string[];
  content!: string;
  coverImageUid?: string | null;
  authorMemberUid?: string;
  authorTeamUid?: string;
  status?: ArticleStatus;
  officeHours?: string | null;
}

export class UpdateArticleDto {
  title?: string;
  slugURL?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  content?: string;
  coverImageUid?: string | null;
  authorMemberUid?: string;
  authorTeamUid?: string;
  status?: ArticleStatus;
  officeHours?: string | null;
}

export class UpdateArticleAccessDto {
  memberUid!: string;
}
