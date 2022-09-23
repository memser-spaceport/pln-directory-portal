import { Observable } from 'rxjs';
import { CSRFGuard } from './csfr.guard';

describe('CSRFGuard', () => {
  let guard: CSRFGuard;
  let hasPassedGuard: boolean | Observable<boolean>;

  const getRequestContextMock = ({ httpMethod }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method: httpMethod,
          body: null,
          query: null,
          headers: [],
          cookieConfig: {},
        }),
      }),
    } as any);

  beforeEach(() => {
    guard = new CSRFGuard();
  });

  describe('when a user makes a request', () => {
    it('should not apply protection on GET requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(
          getRequestContextMock({ httpMethod: 'GET' })
        );
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(true);
    });

    it('should not apply protection on OPTIONS requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(
          getRequestContextMock({ httpMethod: 'OPTIONS' })
        );
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(true);
    });

    it('should not apply protection on HEAD requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(
          getRequestContextMock({ httpMethod: 'HEAD' })
        );
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(true);
    });

    it('should apply protection on POST requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(
          getRequestContextMock({ httpMethod: 'POST' })
        );
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(false);
    });

    it('should apply protection on PATCH requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(
          getRequestContextMock({ httpMethod: 'PATCH' })
        );
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(false);
    });

    it('should apply protection on PUT requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(
          getRequestContextMock({ httpMethod: 'PUT' })
        );
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(false);
    });

    it('should apply protection on DELETE requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(
          getRequestContextMock({ httpMethod: 'DELETE' })
        );
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(false);
    });
  });
});
