import { Injectable, Logger } from '@nestjs/common';
import { LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic, createAnthropic, AnthropicProvider } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { anthropicAuth } from './anthropic-auth';

export type AiProviderType = 'openai' | 'gemini' | 'anthropic';

const VALID_PROVIDERS: ReadonlySet<AiProviderType> = new Set(['openai', 'gemini', 'anthropic']);

type OpusThinkingBlock =
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string };
type OpusTurnPart = OpusThinkingBlock | { type: 'tool_use'; id: string };

/**
 * Tool-call ids from a response whose thinking blocks this SDK dropped.
 * The follow-up request must send those blocks back unchanged.
 */
const pendingTurnByToolCallId = new Map<string, OpusTurnPart[]>();

/**
 * Opus rejects `temperature`, and `ai@4.0.19` throws on reasoning chunks.
 * Thinking stays on (this model rejects `disabled`). Reasoning events are
 * removed from the stream, then restored on the tool-call follow-up.
 */
export function adaptOpusFetch(next: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const response = await next(input, rewriteOpusRequest(init));
    return stripOpusReasoningEvents(response);
  };
}

function rewriteOpusRequest(init?: RequestInit): RequestInit | undefined {
  if (typeof init?.body !== 'string') return init;
  try {
    return { ...init, body: prepareOpusRequestBody(init.body) };
  } catch {
    return init;
  }
}

/** Drops `temperature` and puts captured thinking blocks back on tool-use turns. */
export function prepareOpusRequestBody(body: string): string {
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object') return body;
  if ('temperature' in parsed) delete parsed.temperature;
  if (parsed.thinking?.type === 'disabled') delete parsed.thinking;
  restoreThinkingBlocks(parsed.messages);
  return JSON.stringify(parsed);
}

function restoreThinkingBlocks(messages: unknown) {
  if (!Array.isArray(messages)) return;
  for (const message of messages) {
    if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    if (message.content.some((part) => part?.type === 'thinking' || part?.type === 'redacted_thinking')) continue;
    const toolUse = message.content.find((part) => part?.type === 'tool_use' && pendingTurnByToolCallId.has(part.id));
    if (!toolUse) continue;
    const recorded = pendingTurnByToolCallId.get(toolUse.id) ?? [];
    message.content = mergeThinkingBlocks(recorded, message.content);
    for (const part of recorded) {
      if (part.type === 'tool_use') pendingTurnByToolCallId.delete(part.id);
    }
  }
}

function mergeThinkingBlocks(recorded: OpusTurnPart[], content: Array<{ type?: string; id?: string }>) {
  const merged: unknown[] = [];
  let index = 0;
  while (recorded[index] && recorded[index].type !== 'tool_use') {
    merged.push(recorded[index]);
    index += 1;
  }
  for (const part of content) {
    merged.push(part);
    if (part?.type !== 'tool_use') continue;
    const recordedPart = recorded[index];
    if (recordedPart?.type === 'tool_use' && recordedPart.id === part.id) index += 1;
    while (recorded[index] && recorded[index].type !== 'tool_use') {
      merged.push(recorded[index]);
      index += 1;
    }
  }
  return merged;
}

/** Parses one assistant stream and remembers thinking blocks keyed by tool-call id. */
export function recordOpusSse(sse: string) {
  const capture = new OpusTurnCapture();
  for (const event of sse.split(/\r?\n\r?\n/)) capture.observe(event);
  capture.finish();
}

class OpusTurnCapture {
  private readonly parts: OpusTurnPart[] = [];
  private readonly openThinking = new Map<number, { type: 'thinking'; thinking: string; signature: string }>();
  private finished = false;

  observe(event: string) {
    const parsed = parseSseData(event);
    if (!parsed) return;
    if (parsed.type === 'content_block_start') {
      const block = parsed.content_block;
      if (block?.type === 'thinking' && parsed.index != null) {
        this.openThinking.set(parsed.index, { type: 'thinking', thinking: block.thinking ?? '', signature: '' });
      } else if (block?.type === 'redacted_thinking' && block.data) {
        this.parts.push({ type: 'redacted_thinking', data: block.data });
      } else if (block?.type === 'tool_use' && block.id) {
        this.parts.push({ type: 'tool_use', id: block.id });
      }
      return;
    }
    if (parsed.type === 'content_block_delta' && parsed.index != null) {
      const open = this.openThinking.get(parsed.index);
      if (!open) return;
      if (parsed.delta?.type === 'thinking_delta') open.thinking += parsed.delta.thinking ?? '';
      if (parsed.delta?.type === 'signature_delta') open.signature += parsed.delta.signature ?? '';
      return;
    }
    if (parsed.type === 'content_block_stop' && parsed.index != null) {
      const open = this.openThinking.get(parsed.index);
      if (!open) return;
      this.openThinking.delete(parsed.index);
      if (open.signature) this.parts.push(open);
      return;
    }
    if (parsed.type === 'message_stop') this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    for (const open of this.openThinking.values()) {
      if (open.signature) this.parts.push(open);
    }
    this.openThinking.clear();
    const toolIds = this.parts.filter((part): part is { type: 'tool_use'; id: string } => part.type === 'tool_use');
    if (!toolIds.length || toolIds.length === this.parts.length) return;
    for (const tool of toolIds) pendingTurnByToolCallId.set(tool.id, this.parts);
  }
}

function parseSseData(event: string):
  | {
      type?: string;
      index?: number;
      content_block?: { type?: string; thinking?: string; data?: string; id?: string };
      delta?: { type?: string; thinking?: string; signature?: string };
    }
  | undefined {
  const dataLine = event.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) return undefined;
  const raw = dataLine.slice('data:'.length).trim();
  if (!raw || raw === '[DONE]') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** True for SSE events this SDK turns into unhandled `reasoning` chunks. */
export function isOpusReasoningSseEvent(event: string): boolean {
  const parsed = parseSseData(event);
  if (!parsed) return false;
  const deltaType = parsed.delta?.type;
  if (deltaType === 'thinking_delta' || deltaType === 'signature_delta') return true;
  const blockType = parsed.content_block?.type;
  return blockType === 'thinking' || blockType === 'redacted_thinking';
}

function stripOpusReasoningEvents(response: Response): Response {
  if (!response?.body || typeof response.headers?.get !== 'function') return response;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const capture = new OpusTurnCapture();
  let buffer = '';
  const stream = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        enqueueKeptEvents(events, encoder, controller, capture);
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) enqueueKeptEvents([buffer], encoder, controller, capture);
        capture.finish();
      },
    })
  );
  return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function enqueueKeptEvents(
  events: string[],
  encoder: TextEncoder,
  controller: TransformStreamDefaultController<Uint8Array>,
  capture: OpusTurnCapture
) {
  for (const event of events) {
    if (!event) continue;
    capture.observe(event);
    if (isOpusReasoningSseEvent(event)) continue;
    controller.enqueue(encoder.encode(`${event}\n\n`));
  }
}

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly defaultProvider: AiProviderType;
  private anthropicClient?: AnthropicProvider;
  private anthropicClientOmittingTemperature?: AnthropicProvider;

  constructor() {
    this.defaultProvider = (process.env.AI_PROVIDER as AiProviderType) || 'gemini';
    this.logger.log(`Default AI provider: ${this.defaultProvider}`);
  }

  /**
   * Lazily build the Claude client. `ANTHROPIC_AUTH_MODE=wif` uses the
   * Kubernetes-projected identity token and short-lived Anthropic bearer
   * tokens; the default `api_key` mode preserves the current static-key path.
   */
  private getAnthropicClient(): AnthropicProvider {
    if (this.anthropicClient) return this.anthropicClient;
    this.anthropicClient = this.createAnthropicProvider();
    return this.anthropicClient;
  }

  /** Opus requests drop `temperature`. Thinking events are restored on tool follow-ups. */
  private getAnthropicClientOmittingTemperature(): AnthropicProvider {
    if (this.anthropicClientOmittingTemperature) return this.anthropicClientOmittingTemperature;
    const inner = anthropicAuth.mode === 'wif' ? anthropicAuth.createWifFetch() : globalThis.fetch;
    this.anthropicClientOmittingTemperature = this.createAnthropicProvider(adaptOpusFetch(inner));
    return this.anthropicClientOmittingTemperature;
  }

  private createAnthropicProvider(fetchImpl?: typeof fetch): AnthropicProvider {
    if (anthropicAuth.mode === 'wif') {
      this.logger.log('Anthropic authentication mode: WIF');
      return createAnthropic({
        // @ai-sdk/anthropic@1.x validates that an API key exists before its
        // fetch hook runs. This value is never sent: createWifFetch removes
        // x-api-key and injects the short-lived bearer token instead.
        apiKey: 'wif-managed',
        fetch: fetchImpl ?? anthropicAuth.createWifFetch(),
      });
    }

    const apiKey = anthropicAuth.getApiKey();
    if (!fetchImpl) {
      return apiKey ? createAnthropic({ apiKey }) : anthropic;
    }
    return createAnthropic({ apiKey: apiKey || 'unset', fetch: fetchImpl });
  }

  /**
   * Resolves the effective provider for a given feature.
   * Checks for a feature-specific override env var (e.g., TEAM_ENRICHMENT_AI_PROVIDER),
   * then the feature's own fallback (for features pinned to a specific
   * provider regardless of the global setting, e.g. Husky generation), then
   * the global AI_PROVIDER.
   */
  private resolveProvider(featureProviderEnvVar?: string, fallbackProvider?: AiProviderType): AiProviderType {
    if (featureProviderEnvVar) {
      const override = process.env[featureProviderEnvVar] as AiProviderType | undefined;
      if (override && VALID_PROVIDERS.has(override)) {
        return override;
      }
    }
    if (fallbackProvider && VALID_PROVIDERS.has(fallbackProvider)) {
      return fallbackProvider;
    }
    return this.defaultProvider;
  }

  /**
   * Returns a LanguageModel for generateText with tool support.
   *
   * For OpenAI: uses the Responses API (openai.responses()).
   * For Gemini: uses google() with useSearchGrounding enabled, since
   *   Gemini v1 SDK uses model-level search grounding instead of a separate tool.
   * For Anthropic: uses anthropic() with the configured Claude model.
   *
   * @param featureProviderEnvVar - optional env var name for feature-specific provider override
   * @param options - additional options (e.g., enable search grounding for Gemini)
   */
  getResponsesModel(
    featureProviderEnvVar?: string,
    options?: {
      useSearchGrounding?: boolean;
      fallbackProvider?: AiProviderType;
      /** Skip feature env resolution and use this provider for this call only. */
      providerOverride?: AiProviderType;
      /** Skip OPENAI_LLM_MODEL / GEMINI_MODEL / CLAUDE_MODEL for this call only. */
      modelOverride?: string;
    }
  ): LanguageModel {
    const override = options?.providerOverride;
    const provider =
      override && VALID_PROVIDERS.has(override)
        ? override
        : this.resolveProvider(featureProviderEnvVar, options?.fallbackProvider);

    if (provider === 'gemini') {
      const model = options?.modelOverride || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      return google(model, {
        useSearchGrounding: options?.useSearchGrounding ?? true,
      }) as unknown as LanguageModel;
    }

    if (provider === 'anthropic') {
      const model =
        options?.modelOverride || process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
      const client = /opus/i.test(model) ? this.getAnthropicClientOmittingTemperature() : this.getAnthropicClient();
      return client(model) as LanguageModel;
    }

    const model = options?.modelOverride || process.env.OPENAI_LLM_MODEL || 'gpt-4o';
    return openai.responses(model) as LanguageModel;
  }

  /**
   * Returns web search tool configuration.
   * For OpenAI: returns web_search_preview tool.
   * For Gemini: returns empty object (search grounding is set at model level).
   * For Anthropic: returns Claude's web_search tool as a provider-defined tool.
   *   The underlying @ai-sdk/anthropic@1.x does not yet translate this id to the
   *   Anthropic API, so the SDK emits an "unsupported-tool" warning and Claude
   *   responds from training knowledge. The shape is kept forward-compatible
   *   with later SDK versions that support server-side web search natively.
   */
  getWebSearchTool(
    featureProviderEnvVar?: string,
    options?: {
      searchContextSize?: 'low' | 'medium' | 'high';
      userLocation?: { type: 'approximate'; city?: string; country?: string };
      anthropicMaxUses?: number;
      fallbackProvider?: AiProviderType;
    }
  ): Record<string, any> {
    const provider = this.resolveProvider(featureProviderEnvVar, options?.fallbackProvider);

    if (provider === 'gemini') {
      return {};
    }

    if (provider === 'anthropic') {
      return {
        web_search: {
          type: 'provider-defined' as const,
          id: 'anthropic.web_search_20250305',
          args: {
            maxUses: options?.anthropicMaxUses ?? 5,
            ...(options?.userLocation && {
              userLocation: {
                type: 'approximate',
                ...(options.userLocation.city && { city: options.userLocation.city }),
                ...(options.userLocation.country && { country: options.userLocation.country }),
              },
            }),
          },
          parameters: z.object({ query: z.string() }),
        },
      };
    }

    return {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: options?.searchContextSize || 'medium',
        ...(options?.userLocation && { userLocation: options.userLocation }),
      }),
    };
  }

  /**
   * Returns the resolved model name string (e.g., "gpt-4o", "gemini-2.5-flash", "claude-sonnet-4-6").
   */
  getModelName(featureProviderEnvVar?: string, fallbackProvider?: AiProviderType): string {
    const provider = this.resolveProvider(featureProviderEnvVar, fallbackProvider);

    if (provider === 'gemini') {
      return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }
    if (provider === 'anthropic') {
      return process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    }
    return process.env.OPENAI_LLM_MODEL || 'gpt-4o';
  }
}
