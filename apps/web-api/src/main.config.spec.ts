import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import * as helmet from 'helmet';
import { CsrfFilter, nestCsrf } from 'ncsrf';
import { CSRFGuard } from './guards/csfr.guard';
import { mainConfig } from './main.config';

jest.mock('ncsrf');
jest.mock('cookie-parser');
jest.mock('./guards/csfr.guard');
jest.mock('body-parser', () => ({
  json: jest.fn(),
}));
jest.mock('helmet');

describe('MainConfig', () => {
  let appMock;

  describe('when loading the main config', () => {
    beforeEach(() => {
      (CSRFGuard as jest.Mock).mockClear();
      (nestCsrf as jest.Mock).mockClear();
      (CsrfFilter as jest.Mock).mockClear();
      (cookieParser as jest.Mock).mockClear();

      appMock = {
        use: jest.fn(),
        useGlobalFilters: jest.fn(),
        useGlobalGuards: jest.fn(),
        useGlobalPipes: jest.fn(),
        enableVersioning: jest.fn(),
        enableCors: jest.fn(),
      };
    });

    it('should enable API versioning', () => {
      const enableVersioningSpy = jest.spyOn(appMock, 'enableVersioning');
      mainConfig(appMock);
      expect(enableVersioningSpy).toHaveBeenCalled();
    });

    it('should enable CSRF protection', () => {
      const useSpy = jest.spyOn(appMock, 'use');
      const useGlobalFiltersSpy = jest.spyOn(appMock, 'useGlobalFilters');
      const useGlobalGuardsSpy = jest.spyOn(appMock, 'useGlobalGuards');
      mainConfig(appMock);
      expect(useSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(cookieParser).toHaveBeenCalled();
      expect(nestCsrf).toHaveBeenCalled();
      expect(useGlobalFiltersSpy).toHaveBeenCalled();
      expect(CsrfFilter).toHaveBeenCalled();
      expect(useGlobalGuardsSpy).toHaveBeenCalled();
      expect(CSRFGuard).toHaveBeenCalled();
    });

    it('should enable CORS', () => {
      const enableCorsSpy = jest.spyOn(appMock, 'enableCors');
      mainConfig(appMock);
      expect(enableCorsSpy).toHaveBeenCalled();
    });

    it('should enable JSON body parsing limit', () => {
      const useSpy = jest.spyOn(appMock, 'use');
      const jsonSpy = jest.spyOn(bodyParser, 'json');
      mainConfig(appMock);
      expect(useSpy).toHaveBeenCalled();
      expect(jsonSpy).toHaveBeenCalledWith({ limit: '100kb' });
    });
    it('should enable helmet', () => {
      const useSpy = jest.spyOn(appMock, 'use');
      const helmetSpy = jest.spyOn(helmet, 'default');
      mainConfig(appMock);
      expect(useSpy).toHaveBeenCalled();
      expect(helmetSpy).toHaveBeenCalled();
      expect(helmetSpy).toHaveBeenCalledWith({
        frameguard: {
          action: 'deny',
        },
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'none'"],
          },
        },
        hidePoweredBy: true,
      });
    });
  });
});
