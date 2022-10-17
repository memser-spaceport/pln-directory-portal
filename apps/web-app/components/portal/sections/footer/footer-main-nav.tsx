import Link from 'next/link';

export const FooterMainNav = () => {
  return (
    <nav className="flex w-full flex-col justify-center gap-x-8 sm:flex-row">
      <div className="flex flex-col items-center gap-y-2 text-center sm:items-start sm:text-left">
        <Link href="mailto:spaceport-admin@protocol.ai">
          <a
            className="on-focus--link text-base font-medium hover:rounded hover:bg-slate-200 sm:px-2 sm:py-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contact Us
          </a>
        </Link>
        <Link href="https://protocol.ai/legal/#terms-of-service">
          <a
            className="on-focus--link text-base font-medium hover:rounded hover:bg-slate-200 sm:px-2 sm:py-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms
          </a>
        </Link>
      </div>
      <div className="flex flex-col items-center gap-y-2 text-center sm:items-start sm:text-left">
        <Link href="https://protocol.almanac.io/handbook/protocol-labs-spaceport-JzKymu/swag-ilsLIajsqLXbHLXqwM0EKmvEhX2BuuPf">
          <a
            className="on-focus--link text-base font-medium hover:rounded hover:bg-slate-200 sm:px-2 sm:py-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            Swag
          </a>
        </Link>

        <Link href="https://protocol.almanac.io/handbook/protocol-labs-spaceport-JzKymu/pln-code-of-conduct-ymBUYyonmhfvizGu6yOpXH1qkuWYce96">
          <a
            className="on-focus--link text-base font-medium hover:rounded hover:bg-slate-200 sm:px-2 sm:py-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            PLN Code of Conduct
          </a>
        </Link>
      </div>
      <div className="flex flex-col items-center gap-y-2 text-center sm:items-start sm:text-left">
        <Link href="https://protocol.almanac.io/handbook/protocol-labs-spaceport-JzKymu/network-funding-YANVDroOLIURUJsfFENd8fJerOtbDaSK">
          <a
            className="on-focus--link text-base font-medium hover:rounded hover:bg-slate-200 sm:px-2 sm:py-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            Network Funding
          </a>
        </Link>
        <Link href="https://protocol.almanac.io/handbook/protocol-labs-spaceport-JzKymu/protocol-labs-spaceport-sFKNLxQKYdQOZfLTL4kL9uVha4TdGlYh">
          <a
            className="on-focus--link text-base font-medium hover:rounded hover:bg-slate-200 sm:px-2 sm:py-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            Spaceport Guide to the PLN Galaxy
          </a>
        </Link>
      </div>
    </nav>
  );
};
