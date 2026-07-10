import clsx from 'clsx';
import type { CTACardProps, CTACardGroupProps } from './CTACard.types';
import styles from './CTACard.module.scss';

export function CTACardGroup({ children, className, ...props }: CTACardGroupProps) {
  return <div className={clsx(styles.group, className)} {...props}>{children}</div>;
}

export function CTACard({ icon, title, description, href, onClick, className, ...props }: CTACardProps) {
  const Tag = href ? 'a' : 'button';
  return (
    <Tag href={href} className={clsx(styles.card, className)} onClick={onClick} {...props as any}>
      {icon && <div className={styles.iconWrapper}>{icon}</div>}
      <div className={styles.content}>
        <div className={styles.title}>{title}</div>
        {description && <div className={styles.description}>{description}</div>}
      </div>
      <span className={styles.arrow}>→</span>
    </Tag>
  );
}
