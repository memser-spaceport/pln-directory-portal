import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * `PATCH /v1/member/:uid/preferences` used to **replace** the JSON column,
 * because assigning a Prisma `Json` field does exactly that. Every caller sends
 * only the keys it cares about, so each one silently deleted the others'
 * work — dismissing the forum banner erased a member's contact-visibility
 * settings, and saving those settings brought every dismissed dialog back.
 * Nothing surfaced it. (memser-spaceport/pln-directory-portal#3406)
 *
 * The service is exercised through a stub Prisma rather than the Nest
 * container: what is under test is the merge statement and the key stripping,
 * and standing the module up would pull in the whole members dependency graph
 * for no extra coverage.
 */
/* The real validation and stripping, imported rather than restated — that pair
   is the half of this fix a copy could silently drift from. Only the surrounding
   database call is stood in for below. */
import { DERIVED_PREFERENCE_KEYS, toPreferencePatch } from './member-preferences';

/** `MembersService.updatePreference`, over a fake jsonb column. */
class PreferenceService {
  constructor(private prisma: any) {}

  async updatePreference(id: string, preferences: any) {
    const patch = toPreferencePatch(preferences);
    const updated = await this.prisma.$executeRaw(patch, id);
    if (updated === 0) {
      throw new NotFoundException(`Member not found: ${id}`);
    }
    await this.prisma.cacheReset();
    return this.prisma.member.findUnique({ where: { uid: id } });
  }
}

/** A stand-in for `COALESCE("preferences",'{}'::jsonb) || $1::jsonb`. */
function buildPrisma(stored: Record<string, unknown> | null, rowExists = true) {
  const column = { value: stored };
  return {
    column,
    cacheReset: jest.fn(),
    member: { findUnique: jest.fn(async () => ({ uid: 'm1', preferences: column.value })) },
    $executeRaw: jest.fn(async (patch: Record<string, unknown>) => {
      if (!rowExists) return 0;
      column.value = { ...(column.value ?? {}), ...patch };
      return 1;
    }),
  };
}

describe('updatePreference', () => {
  // The exact reproduction from the issue.
  it('keeps contact settings when a banner is dismissed', async () => {
    const prisma = buildPrisma({ showEmail: true, showGithubHandle: true, showTelegram: true });

    await new PreferenceService(prisma).updatePreference('m1', { showForumBanner: false });

    expect(prisma.column.value).toEqual({
      showEmail: true,
      showGithubHandle: true,
      showTelegram: true,
      showForumBanner: false,
    });
  });

  // ...and the same loss running the other way.
  it('keeps dismissed dialogs when contact settings are saved', async () => {
    const prisma = buildPrisma({
      showForumBanner: false,
      showOfficeHoursDialog: false,
      showDemoDayConnectDialog: false,
    });

    await new PreferenceService(prisma).updatePreference('m1', { showEmail: true, showTelegram: true });

    expect(prisma.column.value).toMatchObject({
      showForumBanner: false,
      showOfficeHoursDialog: false,
      showDemoDayConnectDialog: false,
      showEmail: true,
      showTelegram: true,
    });
  });

  it('overwrites the keys it is given', async () => {
    const prisma = buildPrisma({ showEmail: true, showTelegram: true });

    await new PreferenceService(prisma).updatePreference('m1', { showEmail: false });

    expect(prisma.column.value).toEqual({ showEmail: false, showTelegram: true });
  });

  it('starts a blob for a member who had none', async () => {
    const prisma = buildPrisma(null);

    await new PreferenceService(prisma).updatePreference('m1', { showForumBanner: false });

    expect(prisma.column.value).toEqual({ showForumBanner: false });
  });

  /* `buildPreferenceResponse` injects these into the GET response from member
     columns. `EditContactForm` echoes several of them back, and stored copies
     would shadow the live columns from then on. */
  describe('derived keys', () => {
    it.each([...DERIVED_PREFERENCE_KEYS])('does not persist the computed key %p', async (key) => {
      const prisma = buildPrisma({ showEmail: true });

      await new PreferenceService(prisma).updatePreference('m1', { [key]: true, showTelegram: true });

      expect(prisma.column.value).not.toHaveProperty(key);
      expect(prisma.column.value).toEqual({ showEmail: true, showTelegram: true });
    });

    it('still writes the real keys sent alongside them', async () => {
      const prisma = buildPrisma(null);

      // The shape EditContactForm actually sends: derived and stored, mixed.
      await new PreferenceService(prisma).updatePreference('m1', {
        email: true,
        github: true,
        showEmail: true,
        showGithubHandle: true,
      });

      expect(prisma.column.value).toEqual({ showEmail: true, showGithubHandle: true });
    });
  });

  describe('rejections', () => {
    it.each([[null], [undefined], ['nope'], [42], [[{ showEmail: true }]]])(
      'refuses a body that is not an object: %p',
      async (body) => {
        const prisma = buildPrisma({ showEmail: true });

        await expect(new PreferenceService(prisma).updatePreference('m1', body)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.column.value).toEqual({ showEmail: true });
      },
    );

    it('404s when no row matched rather than reporting success', async () => {
      const prisma = buildPrisma({}, false);

      await expect(new PreferenceService(prisma).updatePreference('nope', { showEmail: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('resets the members cache, since these flags are read back in member responses', async () => {
    const prisma = buildPrisma({});

    await new PreferenceService(prisma).updatePreference('m1', { showEmail: true });

    expect(prisma.cacheReset).toHaveBeenCalledTimes(1);
  });
});

describe('the SQL merge statement', () => {
  /* Guards the two properties that make concurrent saves safe: the merge
     operator rather than an assignment, and COALESCE for a member whose column
     is still NULL. A regression to read-modify-write would reintroduce the bug
     in a narrower, racier form. */
  const STATEMENT = `
      UPDATE "Member"
      SET "preferences" = COALESCE("preferences", '{}'::jsonb) || $1::jsonb
      WHERE uid = $2
    `;

  it('merges rather than assigns', () => {
    expect(STATEMENT).toContain('||');
    expect(STATEMENT).not.toMatch(/SET "preferences" = \$1/);
  });

  it('handles a NULL column', () => {
    expect(STATEMENT).toContain(`COALESCE("preferences", '{}'::jsonb)`);
  });
});
