import React, { PropsWithChildren, ReactNode } from 'react';

import s from './TableFilter.module.scss';
import clsx from 'clsx';

interface Props {
  items: {
    icon: ReactNode;
    label: string;
    count: number;
    id: string;
    activeColor: string;
  }[];
  active: string;
  onFilterClick: (id: string) => void;
}

export const TableFilter = ({ active, items, onFilterClick, children }: PropsWithChildren<Props>) => {
  return (
    <div className={s.root}>
      {items.map((item) => (
        <div
          className={clsx(s.item, {
            [s.active]: active === item.id,
          })}
          key={item.id}
          onClick={() => onFilterClick(item.id)}
        >
          <span className={s.iconWrapper} style={{ color: active === item.id ? item.activeColor : 'inherit' }}>
            {item.icon}
          </span>
          <span className={s.itemLabel}>{item.label}</span>
          <span className={s.itemCount}>{item.count}</span>
        </div>
      ))}
      {children}
    </div>
  );
};
