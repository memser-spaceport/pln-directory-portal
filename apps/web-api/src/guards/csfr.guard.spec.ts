import { Observable } from 'rxjs';
import { CSRFGuard } from './csfr.guard';
import { ExecutionContext } from '@nestjs/common';

import { verify, getSecretFromRequest, getCsrfFromRequest, CsrfNotFoundException, CsrfInvalidException } from 'ncsrf';

jest.mock('ncsrf', () => ({
  verify: jest.fn(),
  getSecretFromRequest: jest.fn(),
  getCsrfFromRequest: jest.fn(),
}));

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
        hasPassedGuard = await guard.canActivate(getRequestContextMock({ httpMethod: 'GET' }));
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(true);
    });

    it('should not apply protection on OPTIONS requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(getRequestContextMock({ httpMethod: 'OPTIONS' }));
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(true);
    });

    it('should not apply protection on HEAD requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(getRequestContextMock({ httpMethod: 'HEAD' }));
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(true);
    });

    it('should apply protection on POST requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(getRequestContextMock({ httpMethod: 'POST' }));
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(false);
    });

    it('should apply protection on PATCH requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(getRequestContextMock({ httpMethod: 'PATCH' }));
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(false);
    });

    it('should apply protection on PUT requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(getRequestContextMock({ httpMethod: 'PUT' }));
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(false);
    });

    it('should apply protection on DELETE requests', async () => {
      try {
        hasPassedGuard = await guard.canActivate(getRequestContextMock({ httpMethod: 'DELETE' }));
      } catch {
        // If the activate method fails, it means it has not passed the guard:
        hasPassedGuard = false;
      }
      expect(hasPassedGuard).toStrictEqual(false);
    });

    const createExecutionContextMock = (method, token = 'token', secret = 'secret') =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            method,
            cookieConfig: { csrfSecret: secret },
          }),
        }),
      } as unknown as ExecutionContext);
    it('should allow GET requests without CSRF protection', () => {
      const context = createExecutionContextMock('GET');
      const canActivate = guard.canActivate(context);
      expect(canActivate).toBe(true);
    });

    it('should throw CsrfNotFoundException if token is missing', () => {
      (getSecretFromRequest as jest.Mock).mockReturnValue('secret');
      (getCsrfFromRequest as jest.Mock).mockReturnValue(null); // Missing token

      const context = createExecutionContextMock('POST');
      expect(() => guard.canActivate(context)).toThrow(CsrfNotFoundException);
    });

    it('should throw CsrfNotFoundException if secret is missing', () => {
      (getSecretFromRequest as jest.Mock).mockReturnValue(null); // Missing secret
      (getCsrfFromRequest as jest.Mock).mockReturnValue('token');

      const context = createExecutionContextMock('POST');
      expect(() => guard.canActivate(context)).toThrow(CsrfNotFoundException);
    });

    it('should throw CsrfInvalidException if token verification fails', () => {
      (getSecretFromRequest as jest.Mock).mockReturnValue('secret');
      (getCsrfFromRequest as jest.Mock).mockReturnValue('token');
      (verify as jest.Mock).mockReturnValue(false); // Verification fails

      const context = createExecutionContextMock('POST');
      expect(() => guard.canActivate(context)).toThrow(CsrfInvalidException);
    });

    it('should allow POST request if token is valid', () => {
      (getSecretFromRequest as jest.Mock).mockReturnValue('secret');
      (getCsrfFromRequest as jest.Mock).mockReturnValue('token');
      (verify as jest.Mock).mockReturnValue(true); // Verification succeeds

      const context = createExecutionContextMock('POST');
      const canActivate = guard.canActivate(context);
      expect(canActivate).toBe(true);
    });

    it('should apply protection on PUT requests with valid CSRF token', () => {
      (getSecretFromRequest as jest.Mock).mockReturnValue('secret');
      (getCsrfFromRequest as jest.Mock).mockReturnValue('token');
      (verify as jest.Mock).mockReturnValue(true); // Verification succeeds

      const context = createExecutionContextMock('PUT');
      const canActivate = guard.canActivate(context);
      expect(canActivate).toBe(true);
    });

    it('should apply protection on DELETE requests with valid CSRF token', () => {
      (getSecretFromRequest as jest.Mock).mockReturnValue('secret');
      (getCsrfFromRequest as jest.Mock).mockReturnValue('token');
      (verify as jest.Mock).mockReturnValue(true); // Verification succeeds

      const context = createExecutionContextMock('DELETE');
      const canActivate = guard.canActivate(context);
      expect(canActivate).toBe(true);
    });
  });
});
