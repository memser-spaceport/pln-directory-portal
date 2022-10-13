import Link from 'next/link';
import { ReactComponent as ArrowRight } from '/public/assets/images/icons/arrow-right.svg';
import { ReactComponent as SmallArrowRight } from '/public/assets/images/icons/small-arrow-right.svg';

type AnimatedArrowLinkProps = {
  url: string;
  label: string;
  styleClassName?: string;
};

export const AnimatedArrowLink = ({
  url,
  label,
  styleClassName,
}: AnimatedArrowLinkProps) => {
  return (
    <Link href={url}>
      <a
        className={`group mr-3 flex items-center text-sm font-semibold leading-5 ${styleClassName}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="relative mr-4 after:absolute after:-bottom-px after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:from-[#4282fc] after:to-[#44d5bb]">
          {label}
        </span>
        <span className="relative">
          <span className="absolute right-0 top-0 -translate-y-1/2 translate-x-0 transform opacity-0 transition-all duration-300 ease-in-out after:absolute after:left-0 after:top-0 after:h-full after:w-full after:transform  after:bg-white after:transition-all after:duration-300 after:ease-in-out group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:after:w-0">
            <ArrowRight />
          </span>
          <span className="absolute right-0 top-0 -translate-y-1/2 transform opacity-100 transition-opacity duration-300 ease-in-out group-hover:opacity-0">
            <SmallArrowRight />
          </span>
        </span>
      </a>
    </Link>
  );
};
