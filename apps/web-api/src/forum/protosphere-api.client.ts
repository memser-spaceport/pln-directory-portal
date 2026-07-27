import axios from 'axios';
import { Injectable } from '@nestjs/common';

export interface NodeBBTopicAuthor {
  memberUid: string | null;
  name: string;
  avatarUrl: string | null;
  role: string | null;
}

export interface NodeBBRecentTopic {
  tid: number;
  cid: number;
  categoryName: string;
  title: string;
  timestamp: number;
  postcount: number;
  bodyHtml: string;
  author: NodeBBTopicAuthor;
  forumTopicUrl: string | null;
}

@Injectable()
export class ProtosphereApiClient {
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

  /**
   * GET /api/recent — public, unauthenticated (NodeBB's own PUBLIC_GET_ALLOWLIST
   * carve-out), so this is a plain guest-level read, no per-caller auth needed.
   */
  async getRecentTopics(opts: { page?: number } = {}): Promise<NodeBBRecentTopic[]> {
    const response = await axios.get(`${this.forumApiUrl}/api/recent`, {
      params: opts.page ? { page: opts.page } : undefined,
    });
    const topics = Array.isArray(response.data?.topics) ? response.data.topics : [];
    return topics.map((topic: any) => this.mapRecentTopic(topic));
  }

  private mapRecentTopic(topic: any): NodeBBRecentTopic {
    // `topic.user` is the topic starter (real author for the feed card);
    // `topic.teaser.user` can be a later replier's stripped-down user object
    // and lacks memberUid/teamRole, so only `topic.user` is used for author.
    const user = topic.user ?? {};
    const webUiBaseUrl = process.env.WEB_UI_BASE_URL;
    return {
      tid: topic.tid,
      cid: topic.cid,
      categoryName: topic.category?.name ?? '',
      title: topic.titleRaw ?? topic.title ?? '',
      timestamp: Number(topic.timestamp) || Date.now(),
      postcount: Number(topic.postcount) || 0,
      bodyHtml: topic.teaser?.content ?? '',
      author: {
        memberUid: user.memberUid ?? null,
        name: user.displayname || user.username || 'Unknown',
        avatarUrl: user.picture ?? null,
        role: user.teamRole ?? null,
      },
      forumTopicUrl: webUiBaseUrl ? `${webUiBaseUrl}/forum/topics/${topic.cid}/${topic.tid}` : null,
    };
  }
}
