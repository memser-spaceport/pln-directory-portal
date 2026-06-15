import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';

import { Member } from '../../../../../types/member';
import { TrashIcon } from '../components/Icons';
import { MemberNameCell } from '../components/MemberNameCell';
import { TeamProjectCell } from '../components/TeamProjectCell';
import { DateCell } from '../components/DateCell';

import s from '../PolicyViewDialog.module.scss';

const columnHelper = createColumnHelper<Member>();

export function useGetColumns(onRemove: (member: Member) => void) {
  return [
    columnHelper.display({
      id: 'member',
      header: 'Members',
      size: 0,
      cell: (info) => <MemberNameCell member={info.row.original} />,
    }),
    columnHelper.display({
      id: 'teamProject',
      header: 'Team/Project',
      size: 200,
      cell: (info) => <TeamProjectCell member={info.row.original} />,
    }),
    columnHelper.display({
      id: 'date',
      header: 'Date',
      size: 120,
      cell: (info) => <DateCell member={info.row.original} />,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 62,
      cell: (info) => (
        <button
          type="button"
          className={s.removeBtn}
          title="Remove from policy"
          onClick={() => onRemove(info.row.original)}
        >
          <TrashIcon />
        </button>
      ),
    }),
  ];
}
