import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { embed, tool, CoreTool } from 'ai';
import { LogService } from '../../shared/log.service';
import { z } from 'zod';
import { QdrantVectorDbService } from '../db/qdrant-vector-db.service';
import { HUSKY_ACTION_TYPES } from '../../utils/constants';

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
    const [allDocsResults, teamsWebsearchResults, memberDocs, teamDocs, projectDocs, focusAreaDocs, irlEventDocs] =
      await Promise.all([
        this.huskyVectorDbService.searchEmbeddings(
          process.env.QDRANT_ALL_DOCS_COLLECTION || '',
          embedding,
          limit,
          true
        ),
        this.huskyVectorDbService.searchEmbeddings(
          process.env.QDRANT_TEAMS_WEBSEARCH_COLLECTION || '',
          embedding,
          limit,
          true
        ),
        this.fetchAndFormatActionDocs(
          HUSKY_ACTION_TYPES.MEMBER,
          process.env.QDRANT_MEMBERS_COLLECTION || '',
          embedding,
          limit
        ),
        this.fetchAndFormatActionDocs(
          HUSKY_ACTION_TYPES.TEAM,
          process.env.QDRANT_TEAMS_COLLECTION || '',
          embedding,
          limit
        ),
        this.fetchAndFormatActionDocs(
          HUSKY_ACTION_TYPES.PROJECT,
          process.env.QDRANT_PROJECTS_COLLECTION || '',
          embedding,
          limit
        ),
        this.fetchAndFormatActionDocs(
          HUSKY_ACTION_TYPES.FOCUS_AREA,
          process.env.QDRANT_FOCUS_AREAS_COLLECTION || '',
          embedding
        ),
        this.fetchAndFormatActionDocs(
          HUSKY_ACTION_TYPES.IRL_EVENT,
          process.env.QDRANT_IRL_EVENTS_COLLECTION || '',
          embedding
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

    const allDocs = [...allDocsResults, ...formattedTeamsWebsearchResults]
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
      .map((result) => `${result?.text}${result?.source ? ` (Source:${result?.source})` : ''}`);

    const actionDocs = [...memberDocs, ...teamDocs, ...projectDocs, ...focusAreaDocs, ...irlEventDocs]
      .map((doc: any) => {
        return {
          id: doc?.id,
          text: doc?.info,
          score: doc?.score,
          source: doc?.directoryLink,
        };
      })
      .filter((v) => v.score > 0.37 && v?.text?.length > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map((result) => `${result?.text}${result?.source ? ` (Source:${result?.source})` : ''}`);

    return [...allDocs, ...actionDocs].join('\n');
  }

  private async fetchAndFormatActionDocs(type: string, collectionName: string, embedding: any, limit = 5) {
    const actionDocs = await this.huskyVectorDbService.searchEmbeddings(collectionName, embedding, limit, true);
    return actionDocs.map((doc) => {
      const metadata: any = doc?.payload?.metadata;
      return {
        name: metadata?.name ?? '',
        directoryLink: metadata?.source ?? '',
        id: doc?.id,
        info: doc?.payload?.content ?? '',
        type: type,
        score: doc.score,
      };
    });
  }
}
