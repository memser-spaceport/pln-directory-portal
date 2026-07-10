import clsx from 'clsx';
import type { OfficeHoursCardProps } from './OfficeHoursCard.types';
import styles from './OfficeHoursCard.module.scss';
import { Avatar } from '@components/Avatar';

const CalIcon = () => (
  <svg className={styles.calIcon} viewBox="0 0 14 14" fill="none">
    <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="white" strokeWidth="1.2"/>
    <line x1="1.5" y1="6" x2="12.5" y2="6" stroke="white" strokeWidth="1.2"/>
    <line x1="4.5" y1="1" x2="4.5" y2="4" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="9.5" y1="1" x2="9.5" y2="4" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

export function OfficeHoursCard({ title, host, onSchedule, scheduleHref, scheduleLabel = 'Schedule Meeting', action, className, ...props }: OfficeHoursCardProps) {
  const BtnTag = scheduleHref ? 'a' : 'button';

  return (
    <div className={clsx(styles.root, className)} {...props}>
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.row}>
        <Avatar
          name={host.name}
          src={host.avatar}
          size="xl"
          shape={host.isTeam ? 'rounded' : 'circle'}
          aria-label=""
        />
        <div className={styles.hostInfo}>
          <div className={styles.hostName}>
            {host.name}
            {host.role && (
              <>
                <span className={styles.hostSep}>·</span>
                <span className={styles.hostAt}>{host.role}</span>
              </>
            )}
          </div>
          {host.bio && <div className={styles.hostBio}>{host.bio}</div>}
        </div>
        {action ?? (
          <BtnTag href={scheduleHref} className={styles.scheduleBtn} onClick={onSchedule}>
            <CalIcon />
            {scheduleLabel}
          </BtnTag>
        )}
      </div>
    </div>
  );
}
