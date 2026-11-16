// The guard module imports axios (ESM), which Jest 27 cannot load; the controller only needs the class reference.
jest.mock('../guards/user-token-check.guard', () => ({
  OptionalUserTokenCheckGuard: class OptionalUserTokenCheckGuard {},
}));

import { Request } from 'express';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import {
  ADMIN_PERMISSIONS,
  FORUM_PERMISSIONS,
  MEMBER_PERMISSIONS,
} from '../access-control-v2/access-control-v2.constants';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

describe('SearchController email permission (LAB-2881)', () => {
  const fetchAllIndices = jest.fn();
  const addAdminAccessFields = jest.fn(async (result) => result);
  const hasPermissionByEmail = jest.fn();
  const controller = new SearchController(
    { fetchAllIndices, addAdminAccessFields } as unknown as SearchService,
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

describe('SearchController admin access fields (LAB-3252)', () => {
  const searchResult = { teams: [], members: [], top: [] };
  const withFields = { teams: [{ uid: 't1', accessLevel: 'L1' }], members: [], top: [] };
  const fetchAllIndices = jest.fn();
  const addAdminAccessFields = jest.fn();
  const hasPermissionByEmail = jest.fn();
  const controller = new SearchController(
    { fetchAllIndices, addAdminAccessFields } as unknown as SearchService,
    { hasPermissionByEmail } as unknown as AccessControlV2Service
  );

  const req = (userEmail?: string) => ({ userEmail, headers: {}, cookies: {} } as unknown as Request);

  beforeEach(() => {
    jest.clearAllMocks();
    fetchAllIndices.mockResolvedValue(searchResult);
    addAdminAccessFields.mockResolvedValue(withFields);
  });

  it('adds the access fields for a directory admin', async () => {
    hasPermissionByEmail.mockImplementation(async (_email: string, code: string) => ({
      allowed: code === ADMIN_PERMISSIONS.DIRECTORY_FULL,
    }));

    const result = await controller.getFullTextSearchResults(req('admin@x.io'), { q: 'horizon', strict: true });

    expect(hasPermissionByEmail).toHaveBeenCalledWith('admin@x.io', ADMIN_PERMISSIONS.DIRECTORY_FULL);
    expect(addAdminAccessFields).toHaveBeenCalledWith(searchResult);
    expect(result).toBe(withFields);
  });

  it('adds no access fields for a member who is not an admin', async () => {
    hasPermissionByEmail.mockResolvedValue({ allowed: false });

    const result = await controller.getFullTextSearchResults(req('investor@x.io'), { q: 'horizon', strict: true });

    expect(addAdminAccessFields).not.toHaveBeenCalled();
    expect(result).toBe(searchResult);
  });

  it('adds no access fields for a logged-out caller', async () => {
    const result = await controller.getFullTextSearchResults(req(undefined), { q: 'horizon', strict: true });

    expect(hasPermissionByEmail).not.toHaveBeenCalled();
    expect(addAdminAccessFields).not.toHaveBeenCalled();
    expect(result).toBe(searchResult);
  });
});
