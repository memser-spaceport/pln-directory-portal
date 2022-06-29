import { ChevronRightIcon } from '@heroicons/react/outline';
import Link from 'next/link';

export interface BreadcrumbProps {
  items: IBreadcrumbItem[];
}

export interface IBreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav
      aria-label="breadcrumb"
      className="inline-flex rounded-lg border border-slate-200 px-3 py-2 leading-6"
    >
      {items.map((item, index, items) => {
        const isLastItem = index === items.length - 1;
        const ariaCurrent: { 'aria-current'?: 'page' } = {
          ...(isLastItem ? { 'aria-current': 'page' } : {}),
        };

        return (
          <div
            className={`flex items-center ${isLastItem ? 'font-semibold' : ''}`}
            key={item.label}
            {...ariaCurrent}
          >
            {item.href ? (
              <Link href={item.href} passHref>
                <a
                  href="replace"
                  className="text-slate-500 hover:text-slate-700 active:text-slate-900"
                >
                  {item.label}
                </a>
              </Link>
            ) : (
              item.label
            )}
            {isLastItem ? null : (
              <ChevronRightIcon className="mx-1 h-4 w-4 text-slate-500" />
            )}
          </div>
        );
      })}
    </nav>
  );
}
