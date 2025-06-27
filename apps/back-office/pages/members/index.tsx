import React, { useMemo, useState } from 'react';

import s from './styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { TableFilter } from '../../components/filters/TableFilter/TableFilter';
import { useRouter } from 'next/router';
import { flexRender, SortingState } from '@tanstack/react-table';
import { useMembersTable } from '../../screens/members/hooks/useMembersTable';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { useMembersList } from '../../hooks/members/useMembersList';
import {
  AddIcon,
  Level0Icon,
  Level1Icon,
  Level2Icon,
  RejectedIcon,
  SortIcon,
} from '../../screens/members/components/icons';
import clsx from 'clsx';

const MembersPage = ({ authToken }: { authToken: string | undefined }) => {
  const router = useRouter();
  const query = router.query;
  const { filter } = query;
  const [active, setActive] = useState<string>((filter as string) ?? 'level1');
  const items = useMemo(() => {
    return [
      {
        id: 'level1',
        icon: <Level1Icon />,
        label: 'L1',
        count: 12,
      },
      {
        id: 'level2',
        icon: <Level2Icon />,
        label: 'L2-L4',
        count: 122,
      },
      {
        id: 'level0',
        icon: <Level0Icon />,
        label: 'L0',
        count: 23,
      },
      {
        id: 'rejected',
        icon: <RejectedIcon />,
        label: 'Rejected',
        count: 34,
      },
    ];
  }, []);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState({});

  const { data } = useMembersList({ authToken });
  const { table } = useMembersTable({ members: data, sorting, setSorting, rowSelection, setRowSelection });

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Members</span>

          <span className={s.filters}>
            <TableFilter items={items} active={active} onFilterClick={(id) => setActive(id)}>
              <button className={s.addNewBtn}>
                <AddIcon /> Add new
              </button>
            </TableFilter>
          </span>
        </div>

        <div className={s.body}>
          <div className={s.table}>
            {/* Header */}
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={s.tableRow}>
                {headerGroup.headers.map((header, i) => {
                  console.log(header.column.columnDef.size);
                  return header.isPlaceholder ? null : (
                    <div
                      className={clsx(s.headerCell, {
                        [s.first]: i === 0,
                        [s.last]: i === headerGroup.headers.length - 1,
                        [s.sortable]: header.column.getCanSort(),
                        [s.fixed]: !!header.column.columnDef.size,
                        [s.flexible]: !header.column.columnDef.size,
                      })}
                      style={{
                        width: header.column.getSize(),
                        flexBasis: header.column.getSize(),
                      }} // ← here
                      onClick={header.column.getToggleSortingHandler()}
                      title={
                        header.column.getCanSort()
                          ? header.column.getNextSortingOrder() === 'asc'
                            ? 'Sort ascending'
                            : header.column.getNextSortingOrder() === 'desc'
                            ? 'Sort descending'
                            : 'Clear sort'
                          : undefined
                      }
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <SortIcon />}
                    </div>
                  );
                })}
              </tr>
            ))}
            {/* Body */}
            {table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <div key={row.id} className={s.tableRow}>
                  {row.getVisibleCells().map((cell) => (
                    <div
                      className={clsx(s.bodyCell, {
                        [s.fixed]: !!cell.column.columnDef.size,
                        [s.flexible]: !cell.column.columnDef.size,
                      })}
                      style={{
                        width: cell.column.getSize(),
                        flexBasis: cell.column.getSize(),
                      }}
                      key={cell.id}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>

                {/* Expanded content */}
                {row.getIsExpanded() && (
                  <div className={s.tableRow}>
                    <div className="bg-gray-50 p-4">
                      <strong>Details:</strong> This is expanded content for {row.original.name}
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default MembersPage;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { plnadmin } = parseCookies(context);
  try {
    if (!plnadmin) {
      const currentUrl = context.resolvedUrl;
      const loginUrl = `/?backlink=${currentUrl}`;
      return {
        redirect: {
          destination: loginUrl,
          permanent: false,
        },
      };
    }

    return {
      props: {
        authToken: plnadmin,
      },
    };
  } catch (error) {
    return {
      props: {
        authToken: '',
        isError: true,
      },
    };
  }
};
