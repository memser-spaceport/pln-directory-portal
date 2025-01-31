import { Injectable } from '@nestjs/common';

@Injectable()
export class AskService {
  formatAskFilterResponse(askTags) {
    // Flatten the tags and calculate counts
    const tagCounts = askTags
      .flatMap((item) => item.tags) // Flatten the tags array
      .reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1; // Count occurrences
        return acc;
      }, {});
    return Object.entries(tagCounts).map(([tag, count]) => ({ tag, count }))
  }
}
