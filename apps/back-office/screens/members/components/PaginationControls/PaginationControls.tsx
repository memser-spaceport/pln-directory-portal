import { Table } from '@tanstack/react-table';
import React from 'react';

import s from './PaginationControls.module.scss';
import { Member } from '../../types/member';

interface Props {
  table: Table<Member>;
}

const PaginationControls = ({ table }: Props) => {
  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  // Determine visible page numbers with ellipsis
  const getVisiblePages = () => {
    const total = pageCount;
    const current = currentPage;
    const visible: (number | 'ellipsis')[] = [];

    if (total <= 5) {
      return Array.from({ length: total }, (_, i) => i);
    }

    // Always show first and last pages
    visible.push(0);

    if (current > 2) visible.push('ellipsis');

    const start = Math.max(1, current - 1);
    const end = Math.min(total - 2, current + 1);

    for (let i = start; i <= end; i++) {
      visible.push(i);
    }

    if (current < total - 3) visible.push('ellipsis');

    visible.push(total - 1);

    return visible;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className={s.root}>
      <div className={s.left}>
        <button className={s.btn} onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          <LeftChevronIcon /> Previous
        </button>

        {/* Page buttons */}
        {visiblePages.map((page, idx) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className={s.ellipsis}>
              …
            </span>
          ) : (
            <button
              key={page}
              className={`${s.pageBtn} ${table.getState().pagination.pageIndex === page ? s.active : ''}`}
              onClick={() => table.setPageIndex(page)}
            >
              {page + 1}
            </button>
          )
        )}

        <button className={s.btn} onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next <RightChevronIcon />
        </button>
      </div>

      <div>
        <span className={s.inputWrapper}>
          Go to
          <input
            type="number"
            min="1"
            max={table.getPageCount()}
            defaultValue={table.getState().pagination.pageIndex + 1}
            onChange={(e) => {
              const page = e.target.value ? Number(e.target.value) - 1 : 0;
              table.setPageIndex(page);
            }}
            className={s.input}
          />{' '}
          of {table.getPageCount().toLocaleString()}
        </span>
      </div>
    </div>
  );
};

export default PaginationControls;

const LeftChevronIcon = () => (
  <svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g filter="url(#filter0_d_230_6929)">
      <path
        d="M13.1625 15.5867C13.3386 15.7628 13.4375 16.0017 13.4375 16.2508C13.4375 16.4998 13.3386 16.7387 13.1625 16.9148C12.9863 17.091 12.7475 17.1899 12.4984 17.1899C12.2493 17.1899 12.0105 17.091 11.8343 16.9148L5.58433 10.6648C5.49693 10.5777 5.42759 10.4742 5.38027 10.3603C5.33295 10.2463 5.30859 10.1242 5.30859 10.0008C5.30859 9.87738 5.33295 9.75521 5.38027 9.64125C5.42759 9.5273 5.49693 9.42381 5.58433 9.33671L11.8343 3.08671C12.0105 2.91059 12.2493 2.81165 12.4984 2.81165C12.7475 2.81165 12.9863 2.91059 13.1625 3.08671C13.3386 3.26283 13.4375 3.5017 13.4375 3.75077C13.4375 3.99984 13.3386 4.23871 13.1625 4.41483L7.5773 9.99999L13.1625 15.5867Z"
        fill="#455468"
      />
    </g>
    <defs>
      <filter
        id="filter0_d_230_6929"
        x="-2"
        y="-1"
        width="24"
        height="24"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="1" />
        <feGaussianBlur stdDeviation="1" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.054902 0 0 0 0 0.0588235 0 0 0 0 0.0666667 0 0 0 0.06 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_230_6929" />
        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_230_6929" result="shape" />
      </filter>
    </defs>
  </svg>
);

const RightChevronIcon = () => (
  <svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g filter="url(#filter0_d_230_6949)">
      <path
        d="M14.4137 10.6632L8.16374 16.9132C7.98761 17.0894 7.74874 17.1883 7.49967 17.1883C7.2506 17.1883 7.01173 17.0894 6.83561 16.9132C6.65949 16.7371 6.56055 16.4983 6.56055 16.2492C6.56055 16.0001 6.65949 15.7612 6.83561 15.5851L12.4223 9.99997L6.83717 4.41325C6.74997 4.32604 6.68079 4.22251 6.6336 4.10857C6.5864 3.99463 6.56211 3.87251 6.56211 3.74919C6.56211 3.62586 6.5864 3.50374 6.6336 3.3898C6.68079 3.27586 6.74997 3.17233 6.83717 3.08512C6.92438 2.99792 7.02791 2.92874 7.14185 2.88155C7.25579 2.83435 7.37791 2.81006 7.50124 2.81006C7.62456 2.81006 7.74668 2.83435 7.86062 2.88155C7.97456 2.92874 8.07809 2.99792 8.1653 3.08512L14.4153 9.33512C14.5026 9.42232 14.5718 9.5259 14.619 9.63991C14.6662 9.75392 14.6904 9.87612 14.6903 9.99951C14.6901 10.1229 14.6656 10.245 14.6182 10.3589C14.5707 10.4728 14.5012 10.5763 14.4137 10.6632Z"
        fill="#455468"
      />
    </g>
    <defs>
      <filter
        id="filter0_d_230_6949"
        x="-2"
        y="-1"
        width="24"
        height="24"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="1" />
        <feGaussianBlur stdDeviation="1" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.054902 0 0 0 0 0.0588235 0 0 0 0 0.0666667 0 0 0 0.06 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_230_6949" />
        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_230_6949" result="shape" />
      </filter>
    </defs>
  </svg>
);
