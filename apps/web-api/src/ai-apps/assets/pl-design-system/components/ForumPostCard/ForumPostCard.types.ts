import type { HTMLAttributes } from 'react';

export interface ForumPostCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  excerpt?: string;
  authorAvatar?: string;
  authorName: string;
  authorRole?: string;
  timeAgo?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  href?: string;
  pinned?: boolean;
}
