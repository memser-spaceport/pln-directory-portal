import { Logger } from '@nestjs/common';
import { PlaaAccessController } from './plaa-access.controller';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { ALL_PERMISSION_CODES, PLAA_MANAGEABLE_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

describe('PlaaAccessController', () => {
  const accessControl = {
    grantDirectPermission: jest.fn(),
    revokeDirectPermission: jest.fn(),
  };
  const controller = new PlaaAccessController(accessControl as unknown as AccessControlV2Service);
  const keyForTeam = (teamUid: string) => ({ integrationKey: { uid: 'key-123', teamUid } } as any);
  const req = keyForTeam('admin-team');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('grants only plaa.access to an approved member', async () => {
    accessControl.grantDirectPermission.mockResolvedValue({});
    await expect(controller.grant('member-1', req)).resolves.toEqual({ ok: true });
    expect(accessControl.grantDirectPermission).toHaveBeenCalledWith(
      'member-1', 'plaa.access', undefined, 'PLAA integration key key-123'
    );
  });

  it('revokes only plaa.access', async () => {
    accessControl.revokeDirectPermission.mockResolvedValue({ ok: true, removed: true });
    await expect(controller.revoke('member-1', req)).resolves.toEqual({ ok: true, removed: true });
    expect(accessControl.revokeDirectPermission).toHaveBeenCalledWith('member-1', 'plaa.access');
  });

  it('does not restrict PLAA operations to the integration key team', async () => {
    accessControl.grantDirectPermission.mockResolvedValue({});
    accessControl.revokeDirectPermission.mockResolvedValue({ ok: true, removed: true });
    const crossTeamKey = keyForTeam('another-team');
    await controller.grant('member-from-any-team', crossTeamKey);
    await controller.revoke('member-from-any-team', crossTeamKey);
    expect(accessControl.grantDirectPermission).toHaveBeenCalledWith(
      'member-from-any-team', 'plaa.access', undefined, 'PLAA integration key key-123'
    );
    expect(accessControl.revokeDirectPermission).toHaveBeenCalledWith('member-from-any-team', 'plaa.access');
  });

  it('logs key and member when revoking access', async () => {
    accessControl.revokeDirectPermission.mockResolvedValue({ ok: true, removed: false });
    await controller.revoke('member-1', req);
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'PLAA access revoked: keyUid=key-123 memberUid=member-1 removed=false'
    );
  });

  it('does not report success or log grant if approval fails', async () => {
    accessControl.grantDirectPermission.mockRejectedValue(new Error('Not approved'));
    await expect(controller.grant('unapproved-member', req)).rejects.toThrow('Not approved');
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  describe('generic PLAA permission routes', () => {
    it.each(['plaa.access', 'plaa.guest', 'plaa.member'] as const)('grants only %s', async (permission) => {
      accessControl.grantDirectPermission.mockResolvedValue({});
      await expect(controller.grantPermission('member-1', { permission }, req)).resolves.toEqual({ ok: true, permission });
      expect(accessControl.grantDirectPermission).toHaveBeenCalledTimes(1);
      expect(accessControl.grantDirectPermission).toHaveBeenCalledWith(
        'member-1', permission, undefined, 'PLAA integration key key-123'
      );
    });

    it.each(['plaa.access', 'plaa.guest', 'plaa.member'] as const)('revokes only %s', async (permission) => {
      accessControl.revokeDirectPermission.mockResolvedValue({ ok: true, removed: true });
      await expect(controller.revokePermission('member-1', { permission }, req)).resolves.toEqual({
        ok: true, removed: true, permission,
      });
      expect(accessControl.revokeDirectPermission).toHaveBeenCalledTimes(1);
      expect(accessControl.revokeDirectPermission).toHaveBeenCalledWith('member-1', permission);
    });

    it('logs key, member and permission', async () => {
      accessControl.grantDirectPermission.mockResolvedValue({});
      accessControl.revokeDirectPermission.mockResolvedValue({ ok: true, removed: false });
      await controller.grantPermission('member-1', { permission: 'plaa.guest' }, req);
      await controller.revokePermission('member-1', { permission: 'plaa.member' }, req);
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        'PLAA permission granted: keyUid=key-123 memberUid=member-1 permission=plaa.guest'
      );
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        'PLAA permission revoked: keyUid=key-123 memberUid=member-1 permission=plaa.member removed=false'
      );
    });

    it('does not report success or log if approval fails', async () => {
      accessControl.grantDirectPermission.mockRejectedValue(new Error('Not approved'));
      await expect(controller.grantPermission('unapproved-member', { permission: 'plaa.member' }, req)).rejects.toThrow(
        'Not approved'
      );
      expect(Logger.prototype.log).not.toHaveBeenCalled();
    });
  });
});

describe('PLAA_MANAGEABLE_PERMISSIONS', () => {
  it('holds only registered permissions from the plaa namespace', () => {
    expect([...PLAA_MANAGEABLE_PERMISSIONS].sort()).toEqual(['plaa.access', 'plaa.guest', 'plaa.member']);
    for (const code of PLAA_MANAGEABLE_PERMISSIONS) {
      expect(code.startsWith('plaa.')).toBe(true);
      expect(ALL_PERMISSION_CODES).toContain(code);
    }
  });
});
