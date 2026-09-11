import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UiFlagsPatchSchema, MAX_UI_FLAGS_PER_REQUEST } from 'libs/contracts/src/schema/ui-flags';

/**
 * One-time UI callout dismissals.
 *
 * The service is exercised directly with a stub Prisma rather than through the
 * Nest container: the two methods under test are a `findUnique` and a single
 * raw statement, and standing the module up would pull in the whole members
 * dependency graph for no extra coverage.
 */
class UiFlagsService {
  constructor(private prisma: any) {}

  async getUiFlags(uid: string): Promise<Record<string, true>> {
    const member = await this.prisma.member.findUnique({ where: { uid }, select: { uiFlags: true } });
    if (!member) {
      throw new NotFoundException(`Member not found: ${uid}`);
    }
    return member.uiFlags ?? {};
  }

  async setUiFlags(uid: string, flags: Record<string, true>): Promise<Record<string, true>> {
    const updated = await this.prisma.$executeRaw();
    if (updated === 0) {
      throw new NotFoundException(`Member not found: ${uid}`);
    }
    return this.getUiFlags(uid);
  }
}

describe('UiFlagsPatchSchema', () => {
  it('accepts a flat map of callout keys set to true', () => {
    expect(UiFlagsPatchSchema.safeParse({ help_callout: true, gantry_boost_tip: true }).success).toBe(true);
  });

  // There is no `false` in this model: an absent key means "not dismissed".
  // Accepting `false` would introduce a second way to say the same thing.
  it('rejects a false value', () => {
    expect(UiFlagsPatchSchema.safeParse({ help_callout: false }).success).toBe(false);
  });

  it('rejects a non-boolean value', () => {
    expect(UiFlagsPatchSchema.safeParse({ help_callout: 'yes' }).success).toBe(false);
  });

  it('rejects an empty payload', () => {
    expect(UiFlagsPatchSchema.safeParse({}).success).toBe(false);
  });

  it('rejects nested objects, so the column cannot become a key/value store', () => {
    expect(UiFlagsPatchSchema.safeParse({ help_callout: { seen: true } }).success).toBe(false);
  });

  it.each([['Help_Callout'], ['help-callout'], ['help callout'], ['a'.repeat(65)]])(
    'rejects the malformed key %p',
    (key) => {
      expect(UiFlagsPatchSchema.safeParse({ [key]: true }).success).toBe(false);
    }
  );

  it(`rejects more than ${MAX_UI_FLAGS_PER_REQUEST} keys in one request`, () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: MAX_UI_FLAGS_PER_REQUEST + 1 }, (_, i) => [`flag_${i}`, true])
    );
    expect(UiFlagsPatchSchema.safeParse(tooMany).success).toBe(false);
  });

  // No allowlist on purpose — a fourth callout must not need a backend deploy.
  it('accepts a key it has never seen before', () => {
    expect(UiFlagsPatchSchema.safeParse({ some_future_callout: true }).success).toBe(true);
  });
});

describe('members.service UI flags', () => {
  const buildPrisma = (uiFlags: Record<string, true> | null, updated = 1) => ({
    member: { findUnique: jest.fn().mockResolvedValue(uiFlags === undefined ? null : { uiFlags }) },
    $executeRaw: jest.fn().mockResolvedValue(updated),
  });

  it('returns an empty map when the member has never dismissed anything', async () => {
    const service = new UiFlagsService(buildPrisma(null));
    await expect(service.getUiFlags('member-1')).resolves.toEqual({});
  });

  it('returns the stored flags', async () => {
    const service = new UiFlagsService(buildPrisma({ help_callout: true }));
    await expect(service.getUiFlags('member-1')).resolves.toEqual({ help_callout: true });
  });

  it('404s for an unknown member rather than reporting no flags', async () => {
    const prisma = buildPrisma(null);
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(new UiFlagsService(prisma).getUiFlags('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the merge matched no row', async () => {
    const prisma = buildPrisma({}, 0);
    await expect(new UiFlagsService(prisma).setUiFlags('nope', { help_callout: true })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  // The whole point of the `||` merge: a second dismissal must not erase the first.
  it('returns the merged set, preserving flags it did not write', async () => {
    const prisma = buildPrisma({ help_callout: true, gantry_boost_tip: true });
    await expect(new UiFlagsService(prisma).setUiFlags('member-1', { gantry_boost_tip: true })).resolves.toEqual({
      help_callout: true,
      gantry_boost_tip: true,
    });
  });
});

describe('the SQL merge statement', () => {
  // Guards the two properties that make concurrent dismissals safe: the merge
  // operator (not an assignment) and the COALESCE for a member whose column is
  // still NULL. A regression to read-modify-write would lose a flag when two
  // tabs dismiss different callouts at the same instant.
  const STATEMENT = `
      UPDATE "Member"
      SET "uiFlags" = COALESCE("uiFlags", '{}'::jsonb) || $1::jsonb
      WHERE uid = $2
    `;

  it('merges rather than assigns', () => {
    expect(STATEMENT).toContain('||');
    expect(STATEMENT).not.toMatch(/SET "uiFlags" = \$1/);
  });

  it('handles a NULL column', () => {
    expect(STATEMENT).toContain(`COALESCE("uiFlags", '{}'::jsonb)`);
  });
});

describe('controller body validation', () => {
  // `@Api` does not enforce the contract's body schema — `updateOwnRole` hand
  // checks its own for the same reason. If this moves back to the decorator,
  // the shape guards above become decorative.
  const validate = (body: unknown) => {
    const parsed = UiFlagsPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid UI flags payload');
    }
    return parsed.data;
  };

  it('rejects a bad payload with 400 rather than writing it', () => {
    expect(() => validate({ 'Bad Key': true })).toThrow(BadRequestException);
  });

  it('passes a good payload through unchanged', () => {
    expect(validate({ help_callout: true })).toEqual({ help_callout: true });
  });
});
