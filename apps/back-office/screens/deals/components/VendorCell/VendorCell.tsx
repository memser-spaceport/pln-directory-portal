import React from 'react';
import { HIGH_VALUE_DEAL_LABEL } from '../../constants';
import { Deal } from '../../types/deal';
import s from './VendorCell.module.scss';

interface Props {
  deal: Deal;
}

export const VendorCell = ({ deal }: Props) => {
  return (
    <div className={s.root}>
      <div className={s.avatar}>
        {deal.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.logoUrl} alt={deal.vendorName} />
        ) : (
          <div className={s.placeholder}>{deal.vendorName.charAt(0)}</div>
        )}
      </div>
      <div className={s.nameRow}>
        <span className={s.name}>{deal.vendorName}</span>
        {deal.isHighValue && (
          <span className={s.highValueLabel} title={HIGH_VALUE_DEAL_LABEL} aria-label={HIGH_VALUE_DEAL_LABEL}>
            ⭐
          </span>
        )}
      </div>
    </div>
  );
};

export default VendorCell;
