import { ForestAdminService } from './forest-admin.service'; // Adjust path as needed
import { LogService } from '../../shared/log.service'; // Adjust path as needed
import axios from 'axios';
import { APP_ENV } from '../constants';

jest.mock('axios');

describe('ForestAdminService', () => {
  let forestAdminService: ForestAdminService;
  let logService: LogService;

  beforeEach(() => {
    logService = new LogService();
    forestAdminService = new ForestAdminService(logService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerAirtableSync', () => {
    it('should call highTouchSync with correct slugs in production environment', async () => {
      // Set the environment to production
      process.env.ENVIRONMENT ='production';
      process.env.HIGHTOUCH_API_KEY = 'mock-api-key';

      const mockAxiosPost = axios.post as jest.Mock;
      mockAxiosPost.mockResolvedValue({});

      await forestAdminService.triggerAirtableSync();
      
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.hightouch.com/api/v1/syncs/trigger',
        { syncSlug: 'team-stage-to-airtable' },
        { headers: { Authorization: 'Bearer mock-api-key' } }
      );

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.hightouch.com/api/v1/syncs/trigger',
        { syncSlug: 'member-stage-to-airtable' },
        { headers: { Authorization: 'Bearer mock-api-key' } }
      );

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.hightouch.com/api/v1/syncs/trigger',
        { syncSlug: 'industry-tag-stage-to-airtable' },
        { headers: { Authorization: 'Bearer mock-api-key' } }
      );
    });

    it('should call highTouchSync with correct slugs in non-production environment', async () => {
      // Set the environment to a non-production value
      process.env.ENVIRONMENT = 'development'; // or any other non-prod environment
      process.env.HIGHTOUCH_API_KEY = 'mock-api-key';

      const mockAxiosPost = axios.post as jest.Mock;
      mockAxiosPost.mockResolvedValue({});

      await forestAdminService.triggerAirtableSync();

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.hightouch.com/api/v1/syncs/trigger',
        { syncSlug: 'team-stage-to-airtable-stage' },
        { headers: { Authorization: 'Bearer mock-api-key' } }
      );
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.hightouch.com/api/v1/syncs/trigger',
        { syncSlug: 'member-stage-to-airtable-stage' },
        { headers: { Authorization: 'Bearer mock-api-key' } }
      );
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.hightouch.com/api/v1/syncs/trigger',
        { syncSlug: 'industry-tag-stage-to-airtable-stage' },
        { headers: { Authorization: 'Bearer mock-api-key' } }
      );
    });

    it('should log error when axios throws', async () => {
      const mockAxiosPost = axios.post as jest.Mock;
      const newError = new Error()
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockAxiosPost.mockRejectedValue(newError);

      await forestAdminService.triggerAirtableSync();
      expect(consoleSpy).toHaveBeenCalledWith(newError);
      consoleSpy.mockRestore();
    });
  });
});
