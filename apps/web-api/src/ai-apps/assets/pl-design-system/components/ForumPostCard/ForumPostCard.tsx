import clsx from 'clsx';
import type { ForumPostCardProps } from './ForumPostCard.types';
import styles from './ForumPostCard.module.scss';
import { Avatar } from '@components/Avatar';

const EyeIcon = () => <svg className={styles.statIcon} viewBox="0 0 14 14" fill="none"><ellipse cx="7" cy="7" rx="5.5" ry="3.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>;
const ThumbIcon = () => <svg className={styles.statIcon} viewBox="0 0 14 14" fill="none"><path d="M2 7.5v4h2V7.5H2ZM5 7.5l2-5 1 .5v3h3l-.5 3.5H5V7.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>;
const CommentIcon = () => <svg className={styles.statIcon} viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 12l2-2.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;

export function ForumPostCard({ title, excerpt, authorAvatar, authorName, authorRole, timeAgo, viewCount, likeCount, commentCount, href, pinned, className, ...props }: ForumPostCardProps) {
  const Tag = href ? 'a' : 'div';

  return (
    <Tag href={href} className={clsx(styles.root, className)} {...props as any}>
      {pinned && <div className={styles.pinnedBadge}>📌 Pinned</div>}
      <div className={styles.title}>{title}</div>
      {excerpt && <p className={styles.excerpt}>{excerpt}</p>}

      <div className={styles.meta}>
        <Avatar
          name={authorName}
          src={authorAvatar}
          size="sm"
          aria-label=""
        />
        <span className={styles.authorText}>
          by <span className={styles.authorName}>{authorName}</span>
          {authorRole && <><span className={styles.dot}>·</span>{authorRole}</>}
          {timeAgo && <><span className={styles.dot}>·</span>{timeAgo}</>}
        </span>
      </div>

      {(viewCount !== undefined || likeCount !== undefined || commentCount !== undefined) && (
        <div className={styles.stats}>
          {viewCount !== undefined && <span className={styles.stat}><EyeIcon />{viewCount.toLocaleString()} Views</span>}
          {likeCount !== undefined && <span className={styles.stat}><ThumbIcon />{likeCount} Likes</span>}
          {commentCount !== undefined && <span className={styles.stat}><CommentIcon />{commentCount} Comments</span>}
        </div>
      )}
    </Tag>
  );
}
