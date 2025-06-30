import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Member } from '../../types/member';
import { MembersIcon, ProjectsIcon } from '../icons';

import s from './ProjectsCell.module.scss';

export const ProjectsCell = ({ member }: { member: Member }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const items = useMemo(() => {
    const result = [];
    member.projectContributions
      .filter((project) => project.projectTitle.length)
      .forEach((project) => {
        result.push({
          icon: <ProjectsIcon />,
          label: project.projectTitle ?? 'n/a',
        });
      });

    member.teamAndRoles?.forEach((item) => {
      result.push({
        icon: <MembersIcon />,
        label: item.teamTitle,
      });
    });

    return result;
  }, [member]);

  const [visibleCount, setVisibleCount] = useState(items.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const containerWidth = container.offsetWidth;
      if (containerWidth === 0) return;

      let total = 0;
      let count = 0;

      for (let i = 0; i < items.length; i++) {
        const badgeEl = itemRefs.current[i];
        if (!badgeEl) continue;

        const badgeWidth = badgeEl.offsetWidth + 8; // include margin
        total += badgeWidth;

        if (total > containerWidth) break;
        count++;
      }

      setVisibleCount(count);
    };

    const observer = new ResizeObserver(() => {
      // Delay to allow layout to settle
      requestAnimationFrame(measure);
    });

    observer.observe(container);

    // One-time initial measure after layout
    setTimeout(measure, 0);

    return () => observer.disconnect();
  }, [items]);

  return (
    <div className={s.root} ref={containerRef}>
      {items.map((item, idx) => {
        if (idx < visibleCount) {
          return (
            <span key={idx} ref={(el) => (itemRefs.current[idx] = el)} className={s.badge}>
              {item.icon}
              <span className={s.label}>{item.label}</span>
            </span>
          );
        }
        return null;
      })}
      {visibleCount < items.length && <span className={`${s.badge} ${s.extra}`}>+{items.length - visibleCount}</span>}
    </div>
  );
};

export default ProjectsCell;
