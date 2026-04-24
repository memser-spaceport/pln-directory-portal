import React from 'react';

type IconProps = { className?: string };

const BASE_PROPS = {
  width: '18',
  height: '18',
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
};

const STROKE_PROPS = {
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const ShieldCheckIcon = ({ className }: IconProps) => (
  <svg {...BASE_PROPS} className={className}>
    <path d="M12 2L3 7V12C3 16.55 6.84 20.74 12 22C17.16 20.74 21 16.55 21 12V7L12 2Z" {...STROKE_PROPS} />
    <path d="M9 12L11 14L15 10" {...STROKE_PROPS} />
  </svg>
);

export const CircleCheckIcon = ({ className }: IconProps) => (
  <svg {...BASE_PROPS} className={className}>
    <circle cx="12" cy="12" r="9" {...STROKE_PROPS} />
    <path d="M8.5 12L11 14.5L15.5 10" {...STROKE_PROPS} />
  </svg>
);

export const CalendarStarIcon = ({ className }: IconProps) => (
  <svg {...BASE_PROPS} className={className}>
    <rect x="3" y="5" width="18" height="16" rx="2" {...STROKE_PROPS} />
    <path d="M3 9H21" {...STROKE_PROPS} />
    <path d="M8 3V6" {...STROKE_PROPS} />
    <path d="M16 3V6" {...STROKE_PROPS} />
    <path d="M12 12L12.9 13.85L15 14.15L13.5 15.6L13.85 17.65L12 16.7L10.15 17.65L10.5 15.6L9 14.15L11.1 13.85L12 12Z" {...STROKE_PROPS} />
  </svg>
);

export const RocketIcon = ({ className }: IconProps) => (
  <svg {...BASE_PROPS} className={className}>
    <path d="M4.5 16.5C3 18 3 21 3 21C3 21 6 21 7.5 19.5C8.35 18.65 8.35 17.35 7.5 16.5C6.65 15.65 5.35 15.65 4.5 16.5Z" {...STROKE_PROPS} />
    <path d="M9 12L5 8C6 5 9 2 15 2C18 2 20 4 20 4C20 4 22 6 22 9C22 15 19 18 16 19L12 15" {...STROKE_PROPS} />
    <path d="M7 14C6 13 6 11 7 10" {...STROKE_PROPS} />
    <path d="M11.5 13C10.5 13 9 11.5 9 10" {...STROKE_PROPS} />
    <circle cx="15" cy="9" r="1.5" {...STROKE_PROPS} />
  </svg>
);

export const TrendUpIcon = ({ className }: IconProps) => (
  <svg {...BASE_PROPS} className={className}>
    <path d="M3 17L9 11L13 15L21 7" {...STROKE_PROPS} />
    <path d="M15 7H21V13" {...STROKE_PROPS} />
  </svg>
);

export const LoaderIcon = ({ className }: IconProps) => (
  <svg {...BASE_PROPS} className={className}>
    <path d="M12 3V6" {...STROKE_PROPS} />
    <path d="M12 18V21" {...STROKE_PROPS} />
    <path d="M5.6 5.6L7.75 7.75" {...STROKE_PROPS} />
    <path d="M16.25 16.25L18.4 18.4" {...STROKE_PROPS} />
    <path d="M3 12H6" {...STROKE_PROPS} />
    <path d="M18 12H21" {...STROKE_PROPS} />
    <path d="M5.6 18.4L7.75 16.25" {...STROKE_PROPS} />
    <path d="M16.25 7.75L18.4 5.6" {...STROKE_PROPS} />
  </svg>
);

export const OutlineStarIcon = ({ className }: IconProps) => (
  <svg {...BASE_PROPS} className={className}>
    <path
      d="M12 3L14.6 8.6L21 9.5L16.5 13.9L17.6 20.2L12 17.3L6.4 20.2L7.5 13.9L3 9.5L9.4 8.6L12 3Z"
      {...STROKE_PROPS}
    />
  </svg>
);

export const ChevronDownIcon = ({ className }: IconProps) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M6 9L12 15L18 9" {...STROKE_PROPS} />
  </svg>
);

export const CloseSmallIcon = ({ className }: IconProps) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M6 6L18 18" {...STROKE_PROPS} />
    <path d="M18 6L6 18" {...STROKE_PROPS} />
  </svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="11" cy="11" r="7" {...STROKE_PROPS} />
    <path d="M20 20L16 16" {...STROKE_PROPS} />
  </svg>
);
