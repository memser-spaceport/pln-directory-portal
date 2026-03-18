import React, { useRef, useState } from 'react';
import { Deal, DealStatus } from '../../types/deal';
import s from './ActionMenu.module.scss';

interface Props {
  deal: Deal;
  onEdit: (deal: Deal) => void;
  onStatusChange: (uid: string, status: DealStatus) => void;
}

export const ActionMenu = ({ deal, onEdit, onStatusChange }: Props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleEdit = () => {
    setOpen(false);
    onEdit(deal);
  };

  const handleActivate = () => {
    setOpen(false);
    onStatusChange(deal.uid, 'ACTIVE');
  };

  const handleDeactivate = () => {
    setOpen(false);
    onStatusChange(deal.uid, 'DEACTIVATED');
  };

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className={s.root} ref={ref}>
      <button className={s.trigger} onClick={() => setOpen((v) => !v)} aria-label="Actions">
        <span className={s.dot} />
        <span className={s.dot} />
        <span className={s.dot} />
      </button>
      {open && (
        <div className={s.menu}>
          <button className={s.item} onClick={handleEdit}>
            Edit
          </button>
          {deal.status !== 'ACTIVE' && (
            <button className={s.item} onClick={handleActivate}>
              Activate
            </button>
          )}
          {deal.status !== 'DEACTIVATED' && (
            <button className={s.item} onClick={handleDeactivate}>
              Deactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ActionMenu;
