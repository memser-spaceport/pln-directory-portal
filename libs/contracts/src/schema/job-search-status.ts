import { z } from 'zod';

/**
 * Where a member is with job hunting, on the wire.
 *
 * **Its own module, and deliberately a leaf.** These three values have to match
 * the `JobSearchStatus` Prisma enum, so there should be one of them — but the
 * obvious home, `member.ts`, cannot be imported from a test-covered contract:
 * it pulls in `linkedin-verification.ts`, which imports `nestjs-zod/z`, an ESM
 * build jest refuses to transform. That is why `admin-member.ts` carries
 * hand-written copies rather than importing the definition next door.
 *
 * So the definition moves down here, where anything can import it without
 * inheriting a dependency graph. `member.ts` re-exports it, so every existing
 * consumer of that name is untouched.
 *
 * `admin-member.ts`'s two inline copies are still inline — converging them is a
 * behaviour-free change worth making on its own, not inside a feature.
 */
export const JobSearchStatusWireSchema = z.enum(['actively-looking', 'open-to-right-role', 'not-looking']);

export type JobSearchStatusWire = z.infer<typeof JobSearchStatusWireSchema>;
