import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  LABOS_AGENT_ERROR_CODES,
  LabosAgentDraftConfirmRequest,
  LabosAgentDraftConfirmResponse,
  LabosAgentStoredDraft,
  LabosAgentStoredProposal,
  LabosAgentThread,
  LabosAgentThreadDeleteResponse,
  LabosAgentThreadListItem,
  LabosAgentThreadListResponse,
  LabosAgentThreadsQuery,
  LabosAgentThreadTurn,
  LabosAgentTurnFeedback,
} from 'libs/contracts/src/schema/labos-agent';
import { CreateIntroRequestDto } from 'libs/contracts/src/schema';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { LabosAgentProposalStore } from './labos-agent-proposals';
import {
  firstQuestionTitle,
  LabosAgentThreadStore,
  StoredDraftDoc,
  StoredProposalDoc,
  ThreadDoc,
  threadNotFound,
  ThreadRowDoc,
  ThreadTurnDoc,
} from './labos-agent-threads.store';
import { LabosAgentService } from './labos-agent.service';

/**
 * LAB-3457: the shared chat history of the agent panel and the full page (T1, T2, T3) and the send or cancel of a
 * saved intro draft (C5). Every route is behind the C1 gate. Old AI search threads of the member are in the same list.
 */
@Injectable()
export class LabosAgentThreadsService implements OnModuleInit {
  private readonly logger = new Logger(LabosAgentThreadsService.name);

  constructor(
    private readonly agent: LabosAgentService,
    private readonly store: LabosAgentThreadStore,
    private readonly proposals: LabosAgentProposalStore,
    private readonly introRequests: IntroRequestsService
  ) {}

  /** LAB-3457: the C3 route checks saved drafts first, so a saved draft is never sent by C3 and C5 both. */
  onModuleInit(): void {
    this.introRequests.useRouteGate((email, input, send) => this.throughSavedDraft(email, input, send));
  }

  /**
   * The C3 gate. A member outside the agent gate has no saved drafts: plain C3, no MongoDB read. For a member inside:
   * - a saved draft to this target that was sent with this text: 409 DRAFT_CLOSED (`sent`), nothing is sent;
   * - else an open saved draft to this target (the newest): C3 takes the same claim as C5 (open -> sent, at most once),
   *   sends this text, and a failed send puts the draft back to open;
   * - else plain C3.
   * A failed read stops the send (fails closed), as C5 needs MongoDB too.
   */
  async throughSavedDraft(
    email: string,
    input: CreateIntroRequestDto,
    send: () => Promise<{ uid: string }>,
    claim = true
  ): Promise<{ uid: string }> {
    let memberUid: string;
    try {
      memberUid = await this.agent.enabledMember(email);
    } catch (error) {
      if (error instanceof ForbiddenException) return send();
      throw error;
    }
    const target = { type: input.type === 'MEMBER' ? ('member' as const) : ('team' as const), uid: input.targetId };
    const saved = await this.store.draftsTo(memberUid, email, target);
    const text = input.text.trim();
    if (saved.some(({ draft }) => draft.status === 'sent' && draft.text.trim() === text)) throw draftClosed('sent');
    const open = claim ? saved.find(({ draft }) => draft.status === 'open') : undefined;
    if (!open) return send();
    const result = await this.sendClaimed(open.threadId, open.draft, text, send);
    // Another request took that draft first: check again, without a claim.
    return result ?? this.throughSavedDraft(email, input, send, false);
  }

  /** T1. */
  async list(email: string, query: LabosAgentThreadsQuery): Promise<LabosAgentThreadListResponse> {
    const memberUid = await this.agent.enabledMember(email);
    const { total, rows } = await this.store.list(memberUid, email, query.page, query.limit);
    return { page: query.page, limit: query.limit, total, items: rows.map(listItem) };
  }

  /** T2. Also loads the thread memory for the next C1 turn, as the AI search thread read does. */
  async get(email: string, threadId: string): Promise<LabosAgentThread> {
    const memberUid = await this.agent.enabledMember(email);
    const doc = await this.store.findOwned(threadId, memberUid, email);
    if (!doc) throw threadNotFound();
    const [feedback] = await Promise.all([
      this.store.feedback(threadId).catch(() => {
        this.logger.error('Failed to read the feedback of a LabOS agent thread');
        return new Map<string, LabosAgentTurnFeedback>();
      }),
      this.store
        .warmSummary(doc, memberUid)
        .catch(() => this.logger.error('Failed to load the memory of a LabOS agent thread')),
    ]);
    const turns = [...(doc.contextual ?? [])].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    const mapped = await Promise.all(turns.map((turn) => this.turn(turn, feedback.get(turn.questionId))));
    return { ...listItem({ ...doc, firstQuestion: turns[0]?.question }), turns: mapped };
  }

  /** T3: soft delete. A second delete is 404. */
  async remove(email: string, threadId: string): Promise<LabosAgentThreadDeleteResponse> {
    const memberUid = await this.agent.enabledMember(email);
    if (!(await this.store.softDelete(threadId, memberUid, email))) throw threadNotFound();
    return { threadId, deleted: true };
  }

  /**
   * C5: sends or cancels one saved intro draft. The claim (open to sent or cancelled) is one atomic write, so a draft
   * is sent at most once. The target comes from the saved draft. A failed send puts the draft back to open.
   */
  async confirmDraft(email: string, body: LabosAgentDraftConfirmRequest): Promise<LabosAgentDraftConfirmResponse> {
    const memberUid = await this.agent.enabledMember(email);
    const doc = await this.store.findOwned(body.threadId, memberUid, email);
    if (!doc) throw threadNotFound();
    const draft = findDraft(doc, body.draftId);
    if (!draft) throw draftNotFound();
    if (draft.status !== 'open') throw draftClosed(draft.status);

    if (body.decision === 'cancel') {
      if (!(await this.store.updateDraft(body.threadId, body.draftId, 'open', { status: 'cancelled' }))) {
        throw await this.lostDraft(body.threadId, body.draftId, memberUid, email);
      }
      return { draftId: body.draftId, status: 'cancelled' };
    }

    const text = body.text ?? '';
    const target = { ...draft.target };
    const sent = await this.sendClaimed(body.threadId, draft, text, () =>
      this.introRequests.create(email, {
        type: target.type === 'member' ? 'MEMBER' : 'TEAM',
        targetId: target.uid,
        text,
      })
    );
    if (!sent) throw await this.lostDraft(body.threadId, body.draftId, memberUid, email);
    return { draftId: body.draftId, status: 'sent', introRequestUid: sent.uid };
  }

  /**
   * The one send of a saved draft (C5, and C3 through the gate): claim open -> sent with the text in one atomic update,
   * then send. A failed send puts the draft back to open with its saved text and passes the error. Undefined when
   * another request changed the draft first (nothing is sent).
   */
  private async sendClaimed(
    threadId: string,
    draft: StoredDraftDoc,
    text: string,
    send: () => Promise<{ uid: string }>
  ): Promise<{ uid: string } | undefined> {
    // Read before the claim: the saved text is what a failed send puts back.
    const savedText = draft.text;
    const claimed = await this.store.updateDraft(threadId, draft.draftId, 'open', {
      status: 'sent',
      text,
      sentAt: Date.now(),
    });
    if (!claimed) return undefined;
    let uid: string;
    try {
      ({ uid } = await send());
    } catch (error) {
      // Not sent: the card is open again with its saved text, so Retry works.
      await this.store
        .updateDraft(threadId, draft.draftId, 'sent', { status: 'open', text: savedText }, ['sentAt'])
        .catch(() => this.logger.error('Failed to reopen a LabOS agent draft after a failed send'));
      throw error;
    }
    await this.store
      .updateDraft(threadId, draft.draftId, 'sent', { introRequestUid: uid })
      .catch(() => this.logger.error('Failed to save the intro request of a sent LabOS agent draft'));
    return { uid };
  }

  /** Another request changed the draft first: 409 with its state, or 404 when it is gone. */
  private async lostDraft(threadId: string, draftId: string, memberUid: string, email: string) {
    const doc = await this.store.findOwned(threadId, memberUid, email);
    const draft = doc ? findDraft(doc, draftId) : undefined;
    if (!draft || draft.status === 'open') return draftNotFound();
    return draftClosed(draft.status);
  }

  private async turn(turn: ThreadTurnDoc, feedback?: LabosAgentTurnFeedback): Promise<LabosAgentThreadTurn> {
    const base = {
      chatId: String(turn.questionId ?? ''),
      question: turn.question ?? '',
      content: turn.response ?? '',
      sources: Array.isArray(turn.sources) ? turn.sources : [],
      ...(Array.isArray(turn.sourceRefs) && turn.sourceRefs.length ? { sourceRefs: turn.sourceRefs } : {}),
      followUpQuestions: Array.isArray(turn.followUpQuestions) ? turn.followUpQuestions : [],
      actions: Array.isArray(turn.actions) ? turn.actions : [],
      createdAt: isoOrNull(turn.createdAt),
      ...(feedback ? { feedback } : {}),
    };
    if (turn.kind !== 'agent') return { ...base, kind: 'ai-search' };
    return {
      ...base,
      kind: 'agent',
      steps: Array.isArray(turn.steps) ? turn.steps : [],
      ...(turn.context ? { context: turn.context } : {}),
      ...(turn.mentions?.length ? { mentions: turn.mentions } : {}),
      proposals: await Promise.all((turn.proposals ?? []).map((proposal) => this.proposalState(proposal))),
      drafts: (turn.drafts ?? []).map(draftState),
      ...(typeof turn.toolCount === 'number' ? { toolCount: turn.toolCount } : {}),
      ...(typeof turn.usedWebSearch === 'boolean' ? { usedWebSearch: turn.usedWebSearch } : {}),
      ...(typeof turn.sourceCount === 'number' ? { sourceCount: turn.sourceCount } : {}),
    };
  }

  /**
   * The card state. An open card past `expiresAt` is expired. An open card that C2 closed while its thread write
   * failed gets the state of the C2 cache record (24 hours).
   */
  private async proposalState(proposal: StoredProposalDoc): Promise<LabosAgentStoredProposal> {
    if (proposal.status !== 'open') return proposal;
    if (Date.now() > Date.parse(proposal.expiresAt)) return { ...proposal, status: 'expired' };
    const record = await this.proposals.load(proposal.proposalId).catch(() => undefined);
    return record && record.status !== 'open' ? { ...proposal, status: record.status } : proposal;
  }
}

function listItem(row: ThreadRowDoc): LabosAgentThreadListItem {
  const createdAt = isoOrNull(row.createdAt) ?? isoOrNull(row.updatedAt) ?? new Date(0).toISOString();
  return {
    threadId: row.threadId,
    title: row.title?.trim() ? row.title.trim() : firstQuestionTitle(row.firstQuestion),
    source: row.source === 'agent' ? 'agent' : 'ai-search',
    ...(row.context ? { context: row.context } : {}),
    createdAt,
    updatedAt: isoOrNull(row.updatedAt) ?? createdAt,
  };
}

function draftState(draft: StoredDraftDoc): LabosAgentStoredDraft {
  const { sentAt, ...rest } = draft;
  const sent = isoOrNull(sentAt);
  return { ...rest, ...(sent ? { sentAt: sent } : {}) };
}

function findDraft(doc: ThreadDoc, draftId: string): StoredDraftDoc | undefined {
  for (const turn of doc.contextual ?? []) {
    const draft = (turn.drafts ?? []).find((item) => item.draftId === draftId);
    if (draft) return draft;
  }
  return undefined;
}

/** A time in ms (AI search documents) or an ISO string as ISO, or null. */
function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function draftNotFound() {
  return new NotFoundException({
    statusCode: 404,
    code: LABOS_AGENT_ERROR_CODES.DRAFT_NOT_FOUND,
    message: 'Draft not found',
  });
}

function draftClosed(status: 'sent' | 'cancelled') {
  return new ConflictException({
    statusCode: 409,
    code: LABOS_AGENT_ERROR_CODES.DRAFT_CLOSED,
    message: 'The draft is closed',
    status,
  });
}
