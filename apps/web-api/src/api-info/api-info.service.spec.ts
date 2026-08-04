import { Test, TestingModule } from '@nestjs/testing';
import { ApiInfoService } from './api-info.service';
import { ApiInfoResponseSchema } from './api-info.schema';
import { API_INFO_SERVICE_NAME, DEFAULT_ENVIRONMENT, UNKNOWN_VERSION } from './api-info.constants';

describe('ApiInfoService', () => {
  let service: ApiInfoService;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiInfoService],
    }).compile();

    service = module.get<ApiInfoService>(ApiInfoService);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a payload matching the response schema', () => {
    expect(ApiInfoResponseSchema.safeParse(service.getApiInfo()).success).toBeTruthy();
  });

  it('should report the constant service name', () => {
    expect(service.getApiInfo().service).toBe(API_INFO_SERVICE_NAME);
  });

  it('should resolve the version from the workspace package.json', () => {
    const { version } = service.getApiInfo();
    expect(typeof version).toBe('string');
    expect(version).not.toBe(UNKNOWN_VERSION);
  });

  describe('environment', () => {
    it('should use NODE_ENV when it is set', () => {
      process.env.NODE_ENV = 'staging';
      expect(service.getApiInfo().environment).toBe('staging');
    });

    it('should fall back to development when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      expect(service.getApiInfo().environment).toBe(DEFAULT_ENVIRONMENT);
    });

    it('should fall back to development when NODE_ENV is empty', () => {
      process.env.NODE_ENV = '';
      expect(service.getApiInfo().environment).toBe(DEFAULT_ENVIRONMENT);
    });
  });

  describe('uptimeSeconds', () => {
    it('should report whole seconds of process uptime', () => {
      jest.spyOn(process, 'uptime').mockReturnValue(12.75);
      expect(service.getApiInfo().uptimeSeconds).toBe(12);
    });

    it('should never be negative', () => {
      expect(service.getApiInfo().uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('timestamp', () => {
    it('should be the current time as a UTC ISO-8601 string', () => {
      const before = Date.now();
      const { timestamp } = service.getApiInfo();
      const after = Date.now();

      expect(timestamp).toBe(new Date(timestamp).toISOString());
      expect(timestamp.endsWith('Z')).toBe(true);
      expect(new Date(timestamp).getTime()).toBeGreaterThanOrEqual(before);
      expect(new Date(timestamp).getTime()).toBeLessThanOrEqual(after);
    });
  });
});
