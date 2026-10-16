// The guard module imports axios (ESM), which Jest 27 cannot load; the controller only needs the class reference.
jest.mock('../guards/user-token-check.guard', () => ({
  OptionalUserTokenCheckGuard: class OptionalUserTokenCheckGuard {},
}));

import { Request } from 'express';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { FORUM_PERMISSIONS, MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

describe('SearchController email permission (LAB-2881)', () => {
  const fetchAllIndices = jest.fn();
  const hasPermissionByEmail = jest.fn();
  const controller = new SearchController(
    { fetchAllIndices } as unknown as SearchService,
    { hasPermissionByEmail } as unknown as AccessControlV2Service
  );

  const req = (userEmail?: string) => ({ userEmail, headers: {}, cookies: {} } as unknown as Request);

  beforeEach(() => {
    jest.clearAllMocks();
    fetchAllIndices.mockResolvedValue({ members: [], top: [] });
  });

  it('enables the email lookup only for a caller with member.contacts.read', async () => {
    hasPermissionByEmail.mockImplementation(async (_email: string, code: string) => ({
      allowed: code === MEMBER_PERMISSIONS.CONTACTS_READ,
    }));

    await controller.getFullTextSearchResults(req('l2@x.io'), { q: 'juan@protocol.ai', strict: true });

    expect(hasPermissionByEmail).toHaveBeenCalledWith('l2@x.io', MEMBER_PERMISSIONS.CONTACTS_READ);
    expect(fetchAllIndices.mock.calls[0][1]).toMatchObject({ canReadContacts: true, canReadForum: false });
  });

  it('disables the email lookup for an L0/L1 caller without the permission', async () => {
    hasPermissionByEmail.mockImplementation(async (_email: string, code: string) => ({
      allowed: code === FORUM_PERMISSIONS.READ,
    }));

    await controller.getFullTextSearchResults(req('l1@x.io'), { q: 'juan@protocol.ai', strict: true });

    expect(fetchAllIndices.mock.calls[0][1]).toMatchObject({ canReadContacts: false });
  });

  it('disables the email lookup for a logged-out caller', async () => {
    await controller.getFullTextSearchResults(req(undefined), { q: 'juan@protocol.ai', strict: true });

    expect(hasPermissionByEmail).not.toHaveBeenCalled();
    expect(fetchAllIndices.mock.calls[0][1]).toMatchObject({ canReadContacts: false });
  });

  it('does not check the contacts permission for a query that is not an email', async () => {
    hasPermissionByEmail.mockResolvedValue({ allowed: true });

    await controller.getFullTextSearchResults(req('l2@x.io'), { q: 'juan', strict: true });

    expect(hasPermissionByEmail).not.toHaveBeenCalledWith('l2@x.io', MEMBER_PERMISSIONS.CONTACTS_READ);
    expect(fetchAllIndices.mock.calls[0][1]).toMatchObject({ canReadContacts: false });
  });
});
