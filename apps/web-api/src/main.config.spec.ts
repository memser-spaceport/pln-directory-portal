import { nestCsrf, CsrfFilter } from 'ncsrf';
import cookieParser from 'cookie-parser';
import { CSRFGuard } from './guards/csfr.guard';
import { mainConfig } from './main.config';

jest.mock('ncsrf');
jest.mock('cookie-parser');
jest.mock('./guards/csfr.guard');

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
        enableVersioning: jest.fn(),
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
      expect(useSpy).toHaveBeenCalledTimes(2);
      expect(cookieParser).toHaveBeenCalled();
      expect(nestCsrf).toHaveBeenCalled();
      expect(useGlobalFiltersSpy).toHaveBeenCalled();
      expect(CsrfFilter).toHaveBeenCalled();
      expect(useGlobalGuardsSpy).toHaveBeenCalled();
      expect(CSRFGuard).toHaveBeenCalled();
    });
  });
});
