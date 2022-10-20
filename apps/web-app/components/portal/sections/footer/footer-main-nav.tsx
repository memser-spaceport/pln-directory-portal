import { FOOTER_MAIN_NAV_LINKS } from './footer.constants';
import { IFooterMainNavLink } from './footer.types';

/**
 * Split the links in chunks of two links each
 */
function chunkLinks(linksArray: IFooterMainNavLink[]) {
  const linksChunks = [];

  for (let index = 0; index < linksArray.length; index += 2) {
    linksChunks.push(linksArray.slice(index, index + 2));
  }

  return linksChunks;
}

export const FooterMainNav = () => {
  return (
    <nav className="mt-10 mb-14 flex w-full flex-col justify-center gap-x-8 gap-y-2 sm:my-0 sm:flex-row sm:gap-y-0">
      {chunkLinks(FOOTER_MAIN_NAV_LINKS).map((linksChunk, linksChunkIndex) => (
        <div
          key={`chunk-${linksChunkIndex}`}
          className="flex flex-col items-center gap-y-2 text-center sm:items-start sm:text-left"
        >
          {linksChunk.map((link, linkIndex) => (
            <a
              key={`chunk-${linksChunkIndex}-link-${linkIndex}`}
              href={link.url}
              className="on-focus--link px-2 py-1 text-base font-medium hover:rounded hover:bg-slate-200"
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
};
