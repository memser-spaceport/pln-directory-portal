import { HomeIcon } from '@heroicons/react/solid';
import Link from 'next/link';

export interface BreadcrumbProps {
  items: IBreadcrumbItem[];
  classname?: string;
}

export interface IBreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items, classname }: BreadcrumbProps) {
  return (
    <nav
      aria-label="breadcrumb"
      className="navbar top-20 z-40 border-t border-t-slate-200 px-16 py-3.5 text-sm leading-6 shadow-[0_1px_4px_0_#e2e8f0]"
    >
      <Link href="/directory">
        <a className="on-focus--link">
          <HomeIcon className="h-4 w-4 fill-slate-600 hover:fill-slate-700" />
        </a>
      </Link>
      <span className="mx-4 text-slate-400">/</span>
      {items.map((item, index, items) => {
        const isLastItem = index === items.length - 1;
        const ariaCurrent: { 'aria-current'?: 'page' } = {
          ...(isLastItem ? { 'aria-current': 'page' } : {}),
        };

        return (
          <div
            className={`${
              isLastItem ? 'flex font-medium text-slate-900' : 'flex text-slate-600'
            }`}
            key={item.label}
            {...ariaCurrent}
          >
            {item.href ? (
              <Link href={item.href} passHref>
                <a
                  href="replace"
                  className="on-focus--link hover:text-slate-700 active:text-slate-900"
                >
                  {item.label}
                </a>
              </Link>
            ) : (
              <p className= {classname}>
              {item.label}
              </p>
            )}
            {isLastItem ? null : <span className="mx-4 text-slate-400">/</span>}
          </div>
        );
      })}
    </nav>
  );
}
