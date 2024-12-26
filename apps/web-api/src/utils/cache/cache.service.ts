import { Injectable, Inject, CACHE_MANAGER } from '@nestjs/common';
import { Cache } from 'cache-manager';
import axios from 'axios';
import { LogService } from '../../shared/log.service';

@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private logService: LogService
  ) { }

  // Mapping service names to tags
  private serviceTagsMap = {
    members: ['member-filters', 'member-list', 'members-roles', "featured", "member-airtable", "member-repositories", "member-detail"],
    projects: ['project-list', 'focus-areas', "project-detail", "team-detail", "featured", "project-oso"],
    teams: ['team-filters', 'team-list', 'focus-areas', "team-detail", "featured"],
    'participants-requests': ['member-filters', 'member-list', 'team-filters', 'team-list', 'focus-areas'],
    PLEventGuest: ["irl-locations", "irl-guests", "irl-locations-topic", "irl-guest-events", "member-preferences"]
  };

  // Reset cache and call API based on service
  async reset(data) {
    const { service } = data;
    await this.cache.reset(); // Reset the cache
    const tags = this.serviceTagsMap[service];
    if (tags) {
      await this.revalidateCache(tags);
    }
  }

  // Function to call the revalidate API
  private async revalidateCache(tags: string[]) {
    const baseUrl = process.env.WEB_UI_BASE_URL;
    const token = process.env.REVALIDATE_API_TOKEN; // Assuming token is stored in env variable
    if (!baseUrl) {
      this.logService.error('WEB_UI_BASE_URL is not defined in the environment variables.');
      return;
    }
    if (!token) {
      this.logService.error('REVALIDATE_API_TOKEN is not defined in the environment variables.');
      return;
    }
    const url = `${baseUrl}/api/revalidate`;
    try {
      const response = await axios.post(
        url,
        { tags },
        {
          headers: {
            Authorization: `Bearer ${token}`, // Adding Bearer token to headers
          },
        },
      );
      this.logService.info(`Revalidation API called successfully with tags: ${tags.join(', ')}`);
    } catch (error) {
      this.logService.error('Error calling revalidate API:', error.message);
    }
  }
}
