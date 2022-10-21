import Link from 'next/link';

type PortalButtonProps = {
  url: string;
  label: string;
};

export const PortalButton = ({ url, label }: PortalButtonProps) => (
  <Link href={url}>
    <a
      className="focus:pln-shadow-01--focus pln-shadow-01 rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-900 hover:border-slate-400 focus:border-blue-600"
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  </Link>
);
