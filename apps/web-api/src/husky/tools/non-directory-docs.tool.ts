import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { embed, tool, CoreTool } from 'ai';
import { LogService } from '../../shared/log.service';
import { z } from 'zod';
import { QdrantVectorDbService } from '../db/qdrant-vector-db.service';

@Injectable()
export class NonDirectoryDocsTool {
  constructor(private logger: LogService, private huskyVectorDbService: QdrantVectorDbService) {}

  getTool(): CoreTool {
    return tool({
      description: 'Search for non directory docs with detailed information',
      parameters: z.object({
        question: z
          .string()
          .describe(
            'Question to search for in non-directory documents, optimized for semantic search and embedding generation'
          ),
      }),
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: { question: string }) {
    this.logger.info(`Getting non directory docs for args: ${JSON.stringify(args)}`);

    const embeddingModel = openai.embedding(process.env.OPENAI_EMBEDDING_MODEL || '');
    const { embedding } = await embed({
      model: embeddingModel,
      value: args.question.toLowerCase(),
    });

    const limit = 25;

    // Get results from both collections
    const [allDocsResults, teamsWebsearchResults] = await Promise.all([
      this.huskyVectorDbService.searchEmbeddings(process.env.QDRANT_ALL_DOCS_COLLECTION || '', embedding, limit, true),
      this.huskyVectorDbService.searchEmbeddings(
        process.env.QDRANT_TEAMS_WEBSEARCH_COLLECTION || '',
        embedding,
        limit,
        true
      ),
    ]);

    const formattedTeamsWebsearchResults = teamsWebsearchResults.map((doc) => {
      return {
        id: doc.id,
        version: doc.version,
        score: doc.score,
        payload: {
          metadata: {
            source: (doc.payload?.metadata as any)?.source ?? '',
            name: (doc.payload?.metadata as any)?.name ?? '',
          },
          page_content: doc.payload?.content,
        },
        groupType: (doc.payload as any)?.type ?? '',
      };
    });

    return [...allDocsResults, ...formattedTeamsWebsearchResults]
      .map((doc: any) => {
        return {
          id: doc?.id,
          score: doc.score,
          text: doc?.payload?.page_content ?? '',
          source: doc?.payload?.metadata?.source ?? '',
        };
      })
      .filter((v) => v.score > 0.45 && v?.text?.length > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map((result) => `${result?.text}${result?.source ? ` (Source:${result?.source})` : ''}`)
      .join('\n');
  }
}
