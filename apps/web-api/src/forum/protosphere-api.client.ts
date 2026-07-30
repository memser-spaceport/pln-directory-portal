import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ProtosphereApiClient {
  private readonly logger = new Logger(ProtosphereApiClient.name);
  private forumApiUrl: string;

  constructor() {
    this.forumApiUrl = process.env.FORUM_API_URL as string;
  }

  async isGroupMember(authToken: string) {
    const response = await axios.get(`${this.forumApiUrl}/groups`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    return response.data.some((group) => group?.memberships?.length > 0);
  }
}
