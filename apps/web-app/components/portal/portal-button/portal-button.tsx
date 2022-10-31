import Link from 'next/link';

interface IPortalButtonProps {
  url: string;
  label: string;
  handleOnClick?: () => void;
}

export const PortalButton = ({
  url,
  label,
  handleOnClick,
}: IPortalButtonProps) => (
  <Link href={url}>
    <a
      className="focus:pln-shadow-01--focus pln-shadow-01 inline-flex rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-900 hover:border-slate-400 focus:border-blue-600"
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        handleOnClick && handleOnClick();
      }}
    >
      {label}
    </a>
  </Link>
);
