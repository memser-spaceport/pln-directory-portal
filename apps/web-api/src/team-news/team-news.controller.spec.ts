import { readFileSync } from 'fs';
import { join } from 'path';
import { apiTeamNews } from 'libs/contracts/src/lib/contract-team-news';

/**
 * `GET /v1/team-news/:newsItemUid` shadows every sibling GET whose last segment
 * is a literal, and Nest resolves that clash by declaration order rather than by
 * specificity. Reordering the handlers would break /latest, /popular and friends
 * silently — they would start answering "no news item with uid 'latest'" — with
 * nothing else in the suite noticing.
 *
 * The shadowed set is derived from the contract rather than listed here, so a
 * literal-segment GET added later is covered without anyone remembering to.
 *
 * Declaration order is read out of the source text rather than off the class:
 * importing the controller pulls its whole DI graph in, and one transitive
 * import (axios) ships ESM this jest config cannot transform. Route order is a
 * property of declaration order in that file, so the file is the right thing to
 * measure.
 */
describe('TeamNewsController route ordering', () => {
  const source = readFileSync(join(__dirname, 'team-news.controller.ts'), 'utf8');
  const declarationIndex = (route: string) => source.indexOf(`@Api(server.route.${route})`);

  const routes = apiTeamNews as unknown as Record<string, { method: string; path: string }>;
  const uidRoute = routes.getTeamNewsItem;
  const uidSegments = uidRoute.path.split('/');

  // Same shape as the uid route, differing only where the uid parameter sits —
  // exactly the routes Express would hand to the uid handler if it came first.
  const isShadowed = (path: string) => {
    const segments = path.split('/');
    return (
      segments.length === uidSegments.length &&
      segments.every((segment, i) => segment === uidSegments[i] || uidSegments[i].startsWith(':'))
    );
  };

  const shadowed = Object.entries(routes)
    .filter(([name, route]) => name !== 'getTeamNewsItem' && route.method === 'GET' && isShadowed(route.path))
    .map(([name]) => name);

  it('declares the :newsItemUid route', () => {
    expect(declarationIndex('getTeamNewsItem')).toBeGreaterThan(-1);
  });

  it('finds the sibling GETs the uid route would shadow', () => {
    // A rewritten path that stopped matching would silently empty the set below
    // and turn every ordering assertion into a no-op.
    expect(shadowed.length).toBeGreaterThan(0);
  });

  it.each(shadowed)('declares %s before the :newsItemUid route', (route) => {
    expect(declarationIndex(route)).toBeGreaterThan(-1);
    expect(declarationIndex(route)).toBeLessThan(declarationIndex('getTeamNewsItem'));
  });
});
