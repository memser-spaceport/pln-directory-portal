import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { LogService } from '../shared/log.service';
import { convertToCoreMessages, embed, generateObject, generateText, streamObject, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { HuskyResponseSchema, HuskyChatInterface, HuskyRephraseQuestionSchema } from 'libs/contracts/src/schema/husky-chat';
import {
  HUSKY_ACTION_TYPES,
  HUSKY_MAX_CONTEXT_LENGTH,

} from '../utils/constants';


import {
  CONTEXTUAL_SYSTEM_PROMPT, 
  HUSKY_CHAT_SUMMARY_SYSTEM_PROMPT, 
  REPHRASE_QUESTION_SYSTEM_PROMPT, 
  HUSKY_NO_INFO_PROMPT,
  PROMPT_FOR_GENERATE_TITLE,
  HUSKY_CONTEXTUAL_SUMMARY_PROMPT,
} from '../utils/ai-prompts'
import Handlebars from 'handlebars';
import { PrismaService } from '../shared/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

interface MemberMetadata {
  teamName?: string;
  role?: string;
}

@Injectable()
export class HuskyAiService {
  constructor(
    private logger: LogService,
    private huskyVectorDbService: QdrantVectorDbService,
    private huskyCacheDbService: RedisCacheDbService,
    private huskyPersistentDbService: MongoPersistantDbService,
    private prisma: PrismaService
  ) { }

  async createContextualResponse(chatInfo: HuskyChatInterface) {
    const { question, chatSummary, threadId, chatId } = chatInfo;

    // Update the chat summary if it is provided
    if (chatSummary) {
      await this.updateChatSummary(threadId, chatSummary);
      this.persistContextualHistory(
        threadId,
        chatId,
        chatSummary.user,
        chatSummary.system || '',
        chatSummary.sources || [],
        chatSummary.followUpQuestions || [],
        chatSummary.actions || []
      ).then(() => { });
    }

    // Rephrase the question and get the matching documents to create context
    const rephrasedQuestion = await this.getRephrasedQuestionBasedOnHistory(threadId, question.toLowerCase());
    const questionEmbedding = await this.getEmbeddingForText(rephrasedQuestion.qdrantQuery);
    const [nonDirectoryDocs, directoryDocs] = await Promise.all([
      this.getEmbeddingsBySource(questionEmbedding, 20),
      this.getDirectoryEmbeddings(questionEmbedding, 30),
    ]);

    const context = await this.createContextWithMatchedDocs(nonDirectoryDocs, directoryDocs);

    // Handle the case when there is no context
    if (context === '') {
      return streamObject({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        schema: HuskyResponseSchema,
        temperature: 0.001,
        prompt: HUSKY_NO_INFO_PROMPT,
        onFinish: async (response) => {
          this.persistContextualHistory(
            threadId,
            chatId,
            question,
            response?.object?.content || '',
            response?.object?.sources || [],
            response?.object?.followUpQuestions || [],
            response?.object?.actions || []
          ).then(() => { });
        },
      });
    }

    // If Context is valid, then create prompt and stream the response
    const chatSummaryFromDb = await this.huskyCacheDbService.get(`${threadId}:summary`);
    return streamObject({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      schema: HuskyResponseSchema,
      system: CONTEXTUAL_SYSTEM_PROMPT,
      prompt: `
        - question: ${rephrasedQuestion.llmQuestion}
        - context: ${context}
        - contextLength: ${HUSKY_MAX_CONTEXT_LENGTH}
        - chatHistory: ${chatSummaryFromDb}
        - action List: ${JSON.stringify(directoryDocs)}
        - currentDate: ${new Date().toISOString().split('T')[0]}
      `,
      temperature: 0.001,
      onFinish: async (response) => {

        this.updateChatSummary(threadId, { user: question, system: response?.object?.content })
            .then((res) => {
              return this.updateChatSummaryInMongo(threadId, res)
            })
            .then(() => { })
        this.persistContextualHistory(
          threadId,
          chatId,
          question,
          response?.object?.content || '' as string,
          response?.object?.sources || [],
          response?.object?.followUpQuestions || [],
          response?.object?.actions || []
        ).then(() => { });
      },
    });
  }

  async updateChatSummaryInMongo(threadId: string, summary: string) {
    await this.huskyPersistentDbService.upsertByKeyValue(process.env.MONGO_CHATS_SUMMARY_COLLECTION || '', 'threadId', threadId, {
      threadId,
      summary,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async persistContextualHistory(
    threadId: string,
    chatId: string,
    question: string,
    response: string | null,
    sources: any[] = [],
    followUpQuestions: any[] = [],
    actions: any[] = []
  ) {

    let doc = await this.huskyPersistentDbService.getDocByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId);
    if (!doc) {
      const newDoc = {
        threadId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        contextual: [
          {
            questionId: chatId,
            question,
            response: response || '',
            actions,
            sources,
            createdAt: Date.now(),
            followUpQuestions,
          }
        ],
      }
      await this.huskyPersistentDbService.create(process.env.MONGO_THREADS_COLLECTION || '', newDoc);

    } else {
      const contextual = doc?.contextual || [];
      const updatedContextual = [
        ...contextual,
        {
          questionId: chatId,
          question,
          response: response || '',
          actions,
          sources,
          createdAt: Date.now(),
          followUpQuestions,
        }
      ]

      doc.updatedAt = Date.now();
      doc.contextual = updatedContextual;
      await this.huskyPersistentDbService.updateDocByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId, doc);
    }


  }

  async duplicateThread(threadId: string, email: string = '', guestUserId?: string) {
    if(email && guestUserId) {
      throw new BadRequestException('You cannot duplicate a thread with both email and guestUserId');
    }
    const threadPromise = this.huskyPersistentDbService.findOneByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId);
    const summaryPromise = this.huskyPersistentDbService.findOneByKeyValue(process.env.MONGO_CHATS_SUMMARY_COLLECTION || '', 'threadId', threadId);
    const [thread, summary] = await Promise.all([threadPromise, summaryPromise]);
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    if (email && thread?.email === email) {
      throw new ForbiddenException('You are not authorized to duplicate this thread');
    }

    let memberDetails: any = {}
    if (email) {
      memberDetails = await this.prisma.member.findUnique({
        where: {
          email: email,
        },
        select: {
          name: true,
          image: true,
        },
      });
    }

    if (email && !memberDetails) {
      throw new NotFoundException('Member not found');
    }

    const newThread = {
      threadId: uuidv4(),
      contextual: thread?.contextual,
      title: thread?.title,
      createdFrom: threadId,
      originalThreadId: thread.originalThreadId || thread.threadId,
      originalThreadTitle: thread.originalThreadTitle || thread.title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(email && { email: email }),
      ...(memberDetails && { memberName: memberDetails?.name, memberImage: memberDetails?.image?.url }),
      ...(guestUserId && { guestUserId: guestUserId }),
    } as { [key: string]: any };

    await this.huskyPersistentDbService.create(process.env.MONGO_THREADS_COLLECTION || '', newThread);
    
    if (summary) {
       await Promise.all([
        this.huskyPersistentDbService.create(process.env.MONGO_CHATS_SUMMARY_COLLECTION || '', {
          summary: summary?.summary,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          threadId: newThread.threadId,
        }),
        this.huskyCacheDbService.set(`${newThread.threadId}:summary`, summary?.summary),
      ]);
    }

    return {
      threadId: newThread.threadId,
    };
  }

  async deleteThreadEmail(threadId: string, email: string) {
    const thread = await this.huskyPersistentDbService.findOneByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId);
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    if (thread?.email !== email) {
      throw new ForbiddenException('You are not authorized to delete this thread');
    }
    await this.huskyPersistentDbService.deleteDocByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId);
  }

  async getEmbeddingForText(text: string) {
    const embeddingModel = openai.embedding(process.env.OPENAI_EMBEDDING_MODEL || '');
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
    });
    return embedding;
  }

  async getRephrasedQuestionBasedOnHistory(threadId: string, question: string) {
    const chatHistory = await this.huskyCacheDbService.get(`${threadId}:summary`);
    if (chatHistory) {
      const { object } = await generateObject({
        model: openai(process.env.OPENAI_LLM_MODEL || ''),
        schema: HuskyRephraseQuestionSchema,
        system: REPHRASE_QUESTION_SYSTEM_PROMPT,
        prompt: `
          chatHistory: ${chatHistory}
          question: ${question}
        `,
      }); 
      return object;
    }
    return {
      qdrantQuery: question,
      llmQuestion: question,
    };
  }

  async updateLastMessage(chatId: string, question: string, response: string) {
    await this.huskyCacheDbService.set(`${chatId}:last-question`, question);
    await this.huskyCacheDbService.set(`${chatId}:last-response`, response);
  }

  async updateChatSummary(chatId: string, rawChatHistory: any) {
    const previousSummary = await this.huskyCacheDbService.get(`${chatId}:summary`);

    // Define a maximum length for the summary
    const maxLength = 500; // Adjust this value as needed

    const aiPrompt = previousSummary
      ? Handlebars.compile(HUSKY_CHAT_SUMMARY_SYSTEM_PROMPT)({ previousChatHistory: previousSummary, question: rawChatHistory.user, response: rawChatHistory.system, maxLength })
      : Handlebars.compile(HUSKY_CHAT_SUMMARY_SYSTEM_PROMPT)({ previousChatHistory: '', question: rawChatHistory.user, response: rawChatHistory.system, maxLength });

    const { text } = await generateText({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      prompt: aiPrompt,
    });
    await this.huskyCacheDbService.set(`${chatId}:summary`, text);
    return text;
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

  async getDirectoryEmbeddings(embedding: any, limit = 5) {
    const [memberDocs, teamDocs, projectDocs, focusAreaDocs, irlEventDocs] = await Promise.all([
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.MEMBER, process.env.QDRANT_MEMBERS_COLLECTION || '', embedding, limit),
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.TEAM, process.env.QDRANT_TEAMS_COLLECTION || '', embedding, limit),
      this.fetchAndFormatActionDocs(
        HUSKY_ACTION_TYPES.PROJECT,
        process.env.QDRANT_PROJECTS_COLLECTION || '',
        embedding, limit
      ),
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.FOCUS_AREA, process.env.QDRANT_FOCUS_AREAS_COLLECTION || '', embedding),
      this.fetchAndFormatActionDocs(HUSKY_ACTION_TYPES.IRL_EVENT, process.env.QDRANT_IRL_EVENTS_COLLECTION || '', embedding),
    ]);

    return {
      memberDocs,
      teamDocs,
      projectDocs,
      focusAreaDocs,
      irlEventDocs,
    };
  }

  async getEmbeddingsBySource(embedding: any, limit = 25) {
    // Get results from both collections
    const [allDocsResults, teamsWebsearchResults] = await Promise.all([
      this.huskyVectorDbService.searchEmbeddings(process.env.QDRANT_ALL_DOCS_COLLECTION || '', embedding, limit, true),
      this.huskyVectorDbService.searchEmbeddings(process.env.QDRANT_TEAMS_WEBSEARCH_COLLECTION || '', embedding, limit, true)
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

    // Combine and sort results by score
    return [...allDocsResults, ...formattedTeamsWebsearchResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async createContextWithMatchedDocs(nonDirectoryDocs: any[], directoryDocs: any, chatId?: string) {
    let allDocs: any[] = [];
    const actionDocKeys = ['memberDocs', 'teamDocs', 'projectDocs', 'focusAreaDocs', 'irlEventDocs'];

    actionDocKeys.forEach((key: string) => {
      const docs = [...directoryDocs[key]].map((doc: any) => {
        return {
          id: doc?.id,
          text: doc?.info,
          score: doc?.score,
          source: doc?.directoryLink,
        };
      });
      allDocs = [...allDocs, ...docs];
    });

    const formattedNonDictoryDocs = [...nonDirectoryDocs].map((doc: any) => {
      return {
        id: doc?.id,
        score: doc.score,
        text: doc?.payload?.page_content ?? '',
        source: doc?.payload?.metadata?.source ?? '',
      };
    });

    const nonDirectory = formattedNonDictoryDocs.filter((v) => v.score > 0.45 && v?.text?.length > 5).sort((a, b) => b.score - a.score).slice(0, 15);
    const directory = allDocs.filter((v) => v.score > 0.37 && v?.text?.length > 5).sort((a, b) => b.score - a.score).slice(0, 15);

    const all = [...directory, ...nonDirectory]

    if (chatId) {
      const selectedIds = all.map((result) => result?.id);
      await this.huskyCacheDbService.set(`${chatId}:last-selected-docs`, selectedIds);
    }

    return all.map((result) => `${result?.text}${result?.source ? ` (Source:${result?.source})` : ''}`).join('\n');
  }

  createPromptForContextualDocs(question: string, context: string) {
    const aiPrompt = Handlebars.compile(HUSKY_CONTEXTUAL_SUMMARY_PROMPT)({
      context,
      question,
    });
    return aiPrompt;
  }

  async createThread(threadId: string, email: string) {
    return await this.huskyPersistentDbService.create(process.env.MONGO_THREADS_COLLECTION || '', {
      threadId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      contextual: [],
      ...(email && { email: email }),
    });
  }

  async createThreadBasicInfo(threadId: string, question: string, email: string = '') {
    const thread = await this.huskyPersistentDbService.findOneByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId);
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    if (email && thread?.email !== email) {
      throw new ForbiddenException('You are not authorized to update this thread');
    }
    let memberDetails: any = {}
    if (email) {
      memberDetails = await this.prisma.member.findUnique({
        where: {
          email: email,
        },
        select: {
          name: true,
          image: true,
        },
      });
    }
    if (email && !memberDetails) {
      throw new NotFoundException('Member not found');
    }

    const prompt = Handlebars.compile(PROMPT_FOR_GENERATE_TITLE)({
      question: question,
    });
    const { text } = await generateText({
      model: openai(process.env.OPENAI_LLM_MODEL || ''),
      prompt: prompt,
    });
    const createdTitle = text || '';
    await this.huskyPersistentDbService.updateByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId, {
      ...(memberDetails && { memberName: memberDetails?.name, memberImage: memberDetails?.image?.url }),
      title: createdTitle,
    });
  }

  async getThreadsByEmail(email: string) {
    try {
      const threads = await this.huskyPersistentDbService.findByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'email', email);
      return threads
        .filter((thread) => thread?.title?.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((thread) => ({
          threadId: thread?.threadId,
          title: thread?.title,
          createdAt: thread?.createdAt,
          updatedAt: thread?.updatedAt,
        }))

    } catch (error) {
      this.logger.error(`Failed to get threads for email ${email}:`, error);
      throw new Error(`Failed to retrieve threads: ${error.message}`);
    }
  }


  async getThreadById(threadId: string, email: string = '') {
    const threadPromise = this.huskyPersistentDbService.findOneByKeyValue(process.env.MONGO_THREADS_COLLECTION || '', 'threadId', threadId);
    const summaryPromise = this.huskyPersistentDbService.findOneByKeyValue(process.env.MONGO_CHATS_SUMMARY_COLLECTION || '', 'threadId', threadId);

    const [thread, summaryData] = await Promise.all([threadPromise, summaryPromise]);
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (summaryData) {
      this.huskyCacheDbService.set(`${threadId}:summary`, summaryData?.summary);
    }

    const chats = thread?.contextual || [];
    return {
      chats: chats.sort((a, b) => a.createdAt - b.createdAt),
      threadId: thread?.threadId,
      title: thread?.title,
      memberName: thread?.memberName,
      memberImage: thread?.memberImage,
      isOwner: thread?.email === email && email !== '',
      ...(thread?.guestUserId && { guestUserId: thread?.guestUserId }),
    }
  }

  async getChatById(uid: string) {
    const threads = await this.huskyPersistentDbService.findByKeyValue(process.env.MONGO_CONVERSATION_COLLECTION || '', 'chatThreadId', uid);
    const allThreads: any = [];
    threads.map((thread: any) => {
      if (thread?.type === "context") {
        const filteredSql = threads.filter((sqlThread: any) => sqlThread.type === "sql" && sqlThread.chatUid === thread.chatUid);
        allThreads.push({
          ...thread,
          sqlData: filteredSql[0]?.data
        })
      }
    })
    return allThreads;
  }

  async createChatbotIntro(id: string, messages: Array<any>) {
    // Convert messages to the correct format and filter out invalid ones
    const validMessages = convertToCoreMessages(messages).filter(
      (message) => message.content.length > 0,
    );
  

    const result = await streamText({
      model: openai('gpt-4o'),
      toolCallStreaming: true,
      system: `
- You help users connect with members in the network!
- Keep responses limited to a sentence.
- DO NOT output lists.
- After every tool call, show the result briefly and wait for user input.
- Today's date is ${new Date().toLocaleDateString()}.
- Ask follow-up questions to guide users through the optimal flow.
- Here's the optimal flow:
  - Search for member (ask who they want to connect with)
  - Confirm member selection (if multiple matches found)
  - Choose connection type (warm intro or self intro)
  - Collect user details (startup info, reason for connection)
  - Select relevant tags for the request
  - Submit request
  - Display tracking number

- For warm intros:
  - Ask for startup description and connection purpose
  - Present relevant tags
  - Create request with tracking ID
  - Confirm submission

- For self intros:
  - Ask for brief self-introduction
  - Present relevant tags  
  - Create request with tracking ID
  - Confirm submission

- End conversation after request confirmation
- Keep professional tone throughout
`,
      messages: validMessages,
      tools: {
        searchMembers: {
          description: "Search for members in the network based on their name and Ask the user for confirmation",
          parameters: z.object({
            nameQuery: z.string().describe("The name to search for"),
            limit: z.number().optional().describe("Maximum number of results to return")
          }),
          execute: async ({ nameQuery, limit = 5 }) => {
            try {
              const members = await this.prisma.member.findMany({
                where: {
                  name: {
                    contains: nameQuery,
                    mode: 'insensitive'
                  }
                },
                select: {
                  uid: true,
                  name: true,
                  image: {
                    select: {
                      url: true
                    }
                  },
                  teamMemberRoles: {
                    select: {
                      role: true,
                      team: {
                        select: {
                          name: true
                        }
                      }
                    }
                  }
                },
                take: limit
              });

              if (members.length === 0) {
                return {
                  members: [],
                  total: 0,
                  noResults: true,
                  text: `No members found matching "${nameQuery}". Please try searching with a different name.`
                };
              }

              const { text } = await generateText({
                model: openai(process.env.OPENAI_LLM_MODEL || ''),
                system: "You help users connect with members in the network. Keep responses limited to a sentence. Be conversational and engaging.",
                prompt: `Generate a response for a search that found ${members.length} members matching "${nameQuery}". The response should ask who they'd like to connect with.`
              });

              return {
                text: text || `Who would you like to connect with?`,
                members: members.map(member => ({
                  id: member.uid,
                  name: member.name,
                  details: member.teamMemberRoles
                    .map(role => `${role.role} at ${role.team.name}`)
                    .join(', '),
                  imageUrl: member.image?.url || null
                })),
                total: members.length,
                noResults: false
              };

            } catch (error) {
              this.logger.error('Error searching members:', error);
              return {
                members: [],
                total: 0,
                error: 'Failed to search members',
                noResults: true
              };
            }
          },
        },
        getIntroductionOptions: {
          description: "Presents introduction options for connecting with a selected member",
          parameters: z.object({
            memberName: z.string().describe("The name of the member the user wants to connect with")
          }),
          execute: async ({ memberName }) => {
            return {
              question: `Cool! How would you like to get introduced to ${memberName}?`,
              options: [
                {
                  id: "warm_intro",
                  text: "Get me an introduction",
                  description: "Request a warm introduction to this person"
                },
                {
                  id: "self_intro",
                  text: "I will introduce myself",
                  description: "Get the contact information to reach out directly"
                }
              ]
            };
          },
        },
        selectTags: {
          description: "Presents a list of predefined tags for the user to select from and returns the selected tags",
          parameters: z.object({
            context: z.string().describe("The context in which the tags are being selected (e.g., 'introduction request')")
          }),
          execute: async ({ context }) => {
            // Define the available tags for selection
            const availableTags = [
              "User Intro",
              "Hiring",
              "Investor Intro/Funding",
              "GTM/Biz Strategy",
              "Technical Support",
              "General",
              "Vendor Intro",
              "Events/Sponsorship",
              "Global Employment",
              "People Management",
              "Tokenomics",
              "Legal & Compliance",
              "Mentorship",
              "Feedback"
            ];
            
            return {
              tags: availableTags,
              text: `Please select the tags that is relevant to your request & click done`,
              selectionContext: context,
            };
          },
        },
        requestIntroduction: {
          description: "Sends a request for an introduction to a network member and generates a tracking ID",
          parameters: z.object({
            targetMemberId: z.string(),
            targetMemberName: z.string(),
            userBriefIntro: z.string(),
            introType: z.enum(["warm_intro", "self_intro"]).describe("Type of introduction: use the ID from the selected getIntroductionOptions option"),
            reasonForIntro: z.string().optional().describe("Reason for introduction (required for warm_intro, optional for self_intro)"),
            tags: z.array(z.string()).describe("Array of tags selected by the user via the selectTags tool")
          }),
          execute: async ({
            targetMemberId,
            targetMemberName,
            userBriefIntro,
            introType,
            reasonForIntro,
            tags
          }) => {
            // Generate a tracking ID in the format 7xxx where x is a digit
            const randomDigits = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            const trackingId = `7${randomDigits}`;
            
            // Here you would store the introduction request in your database
            // For now, just return the response with generated tracking ID
            
            return {
              success: true,
              trackingId,
              introType,
              text: `Introduction request #${trackingId} for ${targetMemberName} has been submitted.`
            };
          },
        },
      },
      onFinish: async (response) => {
        // console.log(response);
      },
    });

    return result;
  }
}
