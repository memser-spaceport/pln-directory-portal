import { AiAppMeRbacGuard } from './ai-app-me-rbac.guard';

const context = (req: any) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any);

describe('AiAppMeRbacGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(() => {
      throw new Error('rbac');
    }),
  };
  const guard = new AiAppMeRbacGuard(reflector as any, {} as any, {} as any);

  it('skips the permission check for a testing user', async () => {
    const req = { aiAppTestingUser: { uid: 'tu-1', name: 'Testing user 1' } };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).not.toHaveBeenCalled();
  });

  it('runs the member permission check otherwise', async () => {
    await expect(guard.canActivate(context({ memberUid: 'm-1' }))).rejects.toThrow('rbac');
  });
});
