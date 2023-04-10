import { FOOTER_MAIN_NAV_LINKS } from './footer.constants';

export const FooterMainNav = () => {
  return (
    <nav className="mb-14 mt-10 grid w-full gap-y-4 text-center text-base font-medium md:my-0 md:max-w-[700px] md:grid-cols-2 md:gap-x-4 md:px-8 lg:grid-cols-3">
      {FOOTER_MAIN_NAV_LINKS.map((link, linkIndex) => (
        <div key={`link-${linkIndex}`}>
          <a
            href={link.url}
            className="on-focus--link px-2 py-1 hover:rounded hover:bg-slate-200"
            target="_blank"
            rel="noopener noreferrer"
          >
            {link.label}
          </a>
        </div>
      ))}
    </nav>
  );
};
