jest.mock('../../rbac/rbac-permission-check', () => ({ memberHasAnyPermission: jest.fn() }));

import { InvestorDbAccess } from './investor-db-access';
import { memberHasAnyPermission } from '../../rbac/rbac-permission-check';
import { INVESTOR_DB_VIEW_PERMISSIONS } from '../../rbac/rbac.constants';

describe('InvestorDbAccess', () => {
  const logger = { info: jest.fn(), error: jest.fn() };
  const rbacService = {} as any;
  const accessControlV2Service = {} as any;
  const access = new InvestorDbAccess(logger as any, rbacService, accessControlV2Service);

  beforeEach(() => jest.clearAllMocks());

  it('denies a signed-out caller without a permission lookup and logs the denial', async () => {
    const result = await access.check({ isLoggedIn: false }, 'getInvestorDb');

    expect(result).toEqual({ allowed: false, message: expect.stringContaining('not logged in') });
    expect(memberHasAnyPermission).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Husky getInvestorDb denied: not logged in member=none');
  });

  it('denies a member without Investor DB permissions and logs tool, reason and member', async () => {
    (memberHasAnyPermission as jest.Mock).mockResolvedValue(false);

    const result = await access.check({ isLoggedIn: true, memberUid: 'member-1' }, 'getWarmIntros');

    expect(result).toEqual({ allowed: false, message: expect.stringContaining('does not have Investor DB access') });
    expect(logger.info).toHaveBeenCalledWith('Husky getWarmIntros denied: no Investor DB access member=member-1');
  });

  it('checks exactly the Investor DB view permissions, so directory.admin.full alone is enough', async () => {
    (memberHasAnyPermission as jest.Mock).mockResolvedValue(true);

    const result = await access.check({ isLoggedIn: true, memberUid: 'admin-1' }, 'getInvestorProfiles');

    expect(result).toEqual({ allowed: true });
    expect(memberHasAnyPermission).toHaveBeenCalledWith(
      rbacService,
      accessControlV2Service,
      'admin-1',
      INVESTOR_DB_VIEW_PERMISSIONS
    );
    expect(INVESTOR_DB_VIEW_PERMISSIONS).toContain('directory.admin.full');
    expect(logger.info).not.toHaveBeenCalled();
  });
});
