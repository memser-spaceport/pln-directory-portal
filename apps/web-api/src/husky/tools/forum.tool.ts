import { Injectable } from '@nestjs/common';
import { LogService } from '../../shared/log.service';
import { SearchService } from '../../search/search.service';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';

@Injectable()
export class ForumTool {
  constructor(private logger: LogService, private searchService: SearchService) {}

  getTool(isLoggedIn: boolean): CoreTool {
    return tool({
      description: 'Search for forum posts and discussions including root posts and replies with author information',
      parameters: z.object({
        query: z.string().describe('Search term to look for in forum posts, titles, or replies'),
        limit: z.number().describe('Maximum number of forum threads to return').optional(),
      }),
      execute: (args) => this.execute(args, isLoggedIn),
    });
  }

  private async execute(args: { query: string; limit?: number }, isLoggedIn: boolean) {
    this.logger.info(`Searching forum posts for query: ${args.query}`);

    if (!isLoggedIn) {
      return 'User is not logged in to access forum posts.';
    }

    try {
      const forumPosts = await this.searchService.searchForumPosts(args.query, args.limit || 5);

      if (forumPosts.length === 0) {
        return 'No forum posts found matching the search query.';
      }

      return forumPosts
        .map((post) => {
          const rootPostInfo = `**Topic:** ${post.topicTitle}
**Forum Link:** ${post.forumLink}
**Root Post by ${post.rootPost.author.name} (${post.rootPost.author.username}):**
${post.rootPost.content}`;

          const repliesInfo =
            post.replies.length > 0
              ? post.replies
                  .map(
                    (reply) =>
                      `**Reply by ${reply.author.name} (${reply.author.username}):**
${reply.content}`
                  )
                  .join('\n\n')
              : 'No replies yet.';

          return `${rootPostInfo}

**Replies (${post.replyCount}):**
${repliesInfo}`;
        })
        .join('\n\n---\n\n');
    } catch (error) {
      this.logger.error(`Error searching forum posts: ${error.message}`);
      return 'Error occurred while searching forum posts. Please try again.';
    }
  }
}
