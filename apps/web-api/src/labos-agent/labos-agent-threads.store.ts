import { Injectable, NotFoundException } from '@nestjs/common';
import { Document, Filter, UpdateFilter } from 'mongodb';
import {
  LABOS_AGENT_ERROR_CODES,
  LabosAgentContext,
  LabosAgentDraft,
  LabosAgentMention,
  LabosAgentProposal,
  LabosAgentStoredDraftStatus,
  LabosAgentThreadSource,
} from 'libs/contracts/src/schema/labos-agent';
import { MongoPersistantDbService } from '../husky/db/mongo-persistant-db.service';
import { RedisCacheDbService } from '../husky/db/redis-cache-db.service';
import { HuskySourceRef } from 'libs/contracts/src/schema/husky-chat';

/*
 * LAB-3457 (Option A in place): agent turns go into the AI search MongoDB collections. The collection names and the
 * `<threadId>:summary` cache key are the ones of `husky-ai.service.ts`; this file only reads and adds fields. No field
 * is renamed or removed, and nothing is hard deleted.
 */
const threadsCollection = () => process.env.MONGO_THREADS_COLLECTION || 'threads';
const summaryCollection = () => process.env.MONGO_CHATS_SUMMARY_COLLECTION || 'chats_summary';
const feedbackCollection = () => process.env.MONGO_FEEDBACK_COLLECTION || '';
/** The AI search thread memory key (husky-ai.service.ts). The agent stream reads it on every turn. */
export const threadSummaryKey = (threadId: string) => `${threadId}:summary`;

/** A saved proposal: the C1 card and its state. `open` past `expiresAt` is shown as expired. */
export type StoredProposalDoc = LabosAgentProposal & {
  status: 'open' | 'done' | 'cancelled' | 'failed';
  summary?: string;
};

/** A saved intro draft: the C1 card and its state. Times are ms, as in the AI search documents. */
export type StoredDraftDoc = LabosAgentDraft & {
  status: LabosAgentStoredDraftStatus;
  introRequestUid?: string;
  sentAt?: number;
};

/**
 * One turn in `contextual[]`. The first fields are the AI search turn (`questionId` = C1 `chatId`, `response` = the
 * answer text), so AI search readers keep working. `kind: 'agent'` and the fields after it are agent turns only.
 */
export type ThreadTurnDoc = {
  questionId: string;
  question: string;
  response: string;
  sources?: string[];
  sourceRefs?: HuskySourceRef[];
  actions?: unknown[];
  followUpQuestions?: string[];
  createdAt?: number;
  kind?: 'agent';
  steps?: string[];
  context?: LabosAgentContext;
  mentions?: LabosAgentMention[];
  proposals?: StoredProposalDoc[];
  drafts?: StoredDraftDoc[];
  toolCount?: number;
  usedWebSearch?: boolean;
  sourceCount?: number;
};

/**
 * One thread document. AI search threads have `email` as the owner and no `memberUid` or `source`. Agent threads have
 * `memberUid` (the owner), `email`, `source: 'agent'` and `context`. An AI search thread that the agent continues gets
 * `memberUid` and keeps its source.
 */
export type ThreadDoc = {
  threadId: string;
  title?: string;
  email?: string;
  memberUid?: string;
  source?: LabosAgentThreadSource;
  context?: LabosAgentContext;
  createdAt?: number;
  updatedAt?: number;
  isDeleted?: boolean;
  deletedAt?: number;
  contextual?: ThreadTurnDoc[];
};

/** A row of the paged list (a small projection). */
export type ThreadRowDoc = Pick<ThreadDoc, 'threadId' | 'title' | 'source' | 'context' | 'createdAt' | 'updatedAt'> & {
  firstQuestion?: string;
};

/**
 * The owner rule. An agent thread (or a continued one) belongs to its `memberUid`. A thread with no `memberUid`
 * belongs to the member with its `email`, as in AI search. A guest thread (neither) belongs to nobody here.
 */
export function ownsThread(doc: Pick<ThreadDoc, 'memberUid' | 'email'>, memberUid: string, email: string): boolean {
  if (doc.memberUid) return doc.memberUid === memberUid;
  return !!email && doc.email === email;
}

/** The owner rule as a MongoDB filter. `memberUid: null` also matches a missing field. */
export function ownerFilter(memberUid: string, email: string): Filter<Document> {
  const owners: Filter<Document>[] = [{ memberUid }];
  if (email) owners.push({ memberUid: null, email });
  return { $or: owners };
}

/** 404 THREAD_NOT_FOUND: missing, another member's, a guest thread or deleted. It never says that the thread exists. */
export function threadNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: LABOS_AGENT_ERROR_CODES.THREAD_NOT_FOUND,
    message: 'Thread not found',
  });
}

/** The longest first-question title (a thread with no title, and a new agent thread before its model title). */
const TITLE_MAX_CHARS = 80;

/** The first question as a title: one line, at most 80 characters. Never empty. */
export function firstQuestionTitle(question: string | undefined): string {
  const line = (question ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return 'Chat';
  return line.length > TITLE_MAX_CHARS ? `${line.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…` : line;
}

/** How many last turns seed the thread memory of an old thread that has no saved summary. */
const SEED_TURNS = 3;
/** The longest seeded memory, about the size of an AI search summary. */
const SEED_MAX_CHARS = 1500;
const SEED_ANSWER_CHARS = 300;

/**
 * The thread memory from the last turns, for an old thread with no summary (no model call). The next turn's summary
 * call folds it in, as with an AI search summary.
 */
export function seedSummary(turns: ThreadTurnDoc[]): string {
  const lines = turns.slice(-SEED_TURNS).map((turn) => {
    const answer = (turn.response ?? '').replace(/\s+/g, ' ').trim();
    const cut = answer.length > SEED_ANSWER_CHARS ? `${answer.slice(0, SEED_ANSWER_CHARS)}…` : answer;
    return `The member asked: ${(turn.question ?? '').trim()} The answer was: ${cut}`;
  });
  return `Earlier in this chat. ${lines.join(' ')}`.slice(0, SEED_MAX_CHARS);
}

/** The MongoDB and cache steps of the shared agent history (LAB-3457). */
@Injectable()
export class LabosAgentThreadStore {
  constructor(private readonly mongo: MongoPersistantDbService, private readonly cache: RedisCacheDbService) {}

  async find(threadId: string): Promise<ThreadDoc | null> {
    return (await this.mongo.findOneWhere(threadsCollection(), { threadId })) as ThreadDoc | null;
  }

  /** The member's own thread that is not deleted, or null (missing, another member's, deleted). */
  async findOwned(threadId: string, memberUid: string, email: string): Promise<ThreadDoc | null> {
    const doc = await this.find(threadId);
    return doc && !doc.isDeleted && ownsThread(doc, memberUid, email) ? doc : null;
  }

  /**
   * Adds a turn to a new thread (`isNew`) or to the member's own thread. A new thread gets the agent header. An own
   * thread gets `memberUid`, so a later email change keeps it; its source and title stay. The write is one atomic
   * `$push`, so a C2 or C5 status write at the same time is not lost.
   */
  async appendTurn(
    target: { threadId: string; memberUid: string; email: string; isNew: boolean },
    header: { title: string; context?: LabosAgentContext },
    turn: ThreadTurnDoc
  ): Promise<void> {
    const now = Date.now();
    const update: UpdateFilter<ThreadDoc> = {
      $set: { memberUid: target.memberUid, updatedAt: now },
      $push: { contextual: turn },
    };
    if (target.isNew) {
      await this.mongo.updateOneWhere<ThreadDoc>(
        threadsCollection(),
        { threadId: target.threadId },
        {
          ...update,
          $setOnInsert: {
            source: 'agent',
            email: target.email,
            title: header.title,
            createdAt: now,
            ...(header.context ? { context: header.context } : {}),
          },
        },
        { upsert: true }
      );
      return;
    }
    await this.mongo.updateOneWhere<ThreadDoc>(
      threadsCollection(),
      { threadId: target.threadId, isDeleted: { $ne: true }, ...ownerFilter(target.memberUid, target.email) },
      update
    );
  }

  /** Replaces the first-question title with the model title, unless the title changed in the meantime. */
  async replaceTitle(threadId: string, from: string, title: string): Promise<void> {
    await this.mongo.updateOneWhere(threadsCollection(), { threadId, title: from }, { $set: { title } });
  }

  /** C2 (best effort): the state of one saved proposal. */
  async markProposal(threadId: string, proposalId: string, status: StoredProposalDoc['status'], summary?: string) {
    await this.mongo.updateOneWhere(
      threadsCollection(),
      { threadId, 'contextual.proposals.proposalId': proposalId },
      {
        $set: {
          'contextual.$[t].proposals.$[p].status': status,
          ...(summary ? { 'contextual.$[t].proposals.$[p].summary': summary } : {}),
        },
      },
      { arrayFilters: [{ 't.proposals.proposalId': proposalId }, { 'p.proposalId': proposalId }] }
    );
  }

  /**
   * C5: changes one saved draft only when it has the status `from`. True when this call changed it, so two requests
   * at once cannot both send. `set` and `unset` are draft fields.
   */
  async updateDraft(
    threadId: string,
    draftId: string,
    from: LabosAgentStoredDraftStatus,
    set: Partial<StoredDraftDoc>,
    unset: Array<keyof StoredDraftDoc> = []
  ): Promise<boolean> {
    const path = (field: string) => `contextual.$[t].drafts.$[d].${field}`;
    const result = await this.mongo.updateOneWhere<Document>(
      threadsCollection(),
      {
        threadId,
        isDeleted: { $ne: true },
        contextual: { $elemMatch: { drafts: { $elemMatch: { draftId, status: from } } } },
      },
      {
        $set: Object.fromEntries(Object.entries(set).map(([field, value]) => [path(field), value])),
        ...(unset.length ? { $unset: Object.fromEntries(unset.map((field) => [path(field), ''])) } : {}),
      },
      { arrayFilters: [{ 't.drafts.draftId': draftId }, { 'd.draftId': draftId, 'd.status': from }] }
    );
    return result.modifiedCount === 1;
  }

  /** T1: one page of the member's threads with at least one turn, newest first, deleted threads left out. */
  async list(memberUid: string, email: string, page: number, limit: number) {
    const filter: Filter<Document> = {
      ...ownerFilter(memberUid, email),
      isDeleted: { $ne: true },
      'contextual.0': { $exists: true },
    };
    const [total, rows] = await Promise.all([
      this.mongo.countWhere(threadsCollection(), filter),
      this.mongo.aggregate(threadsCollection(), [
        { $match: filter },
        { $sort: { updatedAt: -1, _id: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            threadId: 1,
            title: 1,
            source: 1,
            context: 1,
            createdAt: 1,
            updatedAt: 1,
            firstQuestion: { $arrayElemAt: ['$contextual.question', 0] },
          },
        },
      ]),
    ]);
    return { total, rows: rows as ThreadRowDoc[] };
  }

  /** T3: soft delete. The data stays; both histories leave the thread out. True when this call deleted it. */
  async softDelete(threadId: string, memberUid: string, email: string): Promise<boolean> {
    const result = await this.mongo.updateOneWhere(
      threadsCollection(),
      { threadId, isDeleted: { $ne: true }, ...ownerFilter(memberUid, email) },
      { $set: { isDeleted: true, deletedAt: Date.now() } }
    );
    return result.modifiedCount === 1;
  }

  /** The thumbs of the thread's turns by `questionId` (AI search feedback). Empty when the collection is not set. */
  async feedback(threadId: string): Promise<Map<string, { rating: unknown; reasons?: unknown }>> {
    if (!feedbackCollection()) return new Map();
    const votes = await this.mongo.findByKeyValue(feedbackCollection(), 'threadId', threadId);
    return new Map(
      (votes ?? []).map((vote) => [String(vote.questionId), { rating: vote.rating, reasons: vote.reasons }] as const)
    );
  }

  /**
   * Loads the thread memory into the cache when it is not there (it expires after a day), so the agent continues an
   * old thread with its context: the saved summary, else a seed from the last turns.
   */
  async warmSummary(doc: ThreadDoc): Promise<void> {
    const key = threadSummaryKey(doc.threadId);
    if (await this.cache.get(key)) return;
    const saved = await this.mongo.findOneWhere(summaryCollection(), { threadId: doc.threadId });
    const summary = typeof saved?.summary === 'string' && saved.summary.trim() ? saved.summary : '';
    const turns = doc.contextual ?? [];
    const value = summary || (turns.length ? seedSummary(turns) : '');
    if (value) await this.cache.set(key, value);
  }
}
