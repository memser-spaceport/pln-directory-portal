import React from 'react';
import { Deal } from '../../types/deal';
import s from './VendorCell.module.scss';

interface Props {
  deal: Deal;
}

export const VendorCell = ({ deal }: Props) => {
  return (
    <div className={s.root}>
      <div className={s.avatar}>
        {deal.vendorLogoUrl ? (
          <img src={deal.vendorLogoUrl} alt={deal.vendorName} />
        ) : (
          <div className={s.placeholder}>{deal.vendorName.charAt(0)}</div>
        )}
      </div>
      <div className={s.name}>{deal.vendorName}</div>
    </div>
  );
};

export default VendorCell;
