import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import {
  LogoVerificationInput,
  LogoVerificationResult,
} from './logo-verification.types';

type LogoVlmProvider = 'gemini' | 'openai' | 'anthropic';
type LogoDecision = 'accept' | 'reject' | 'review';

@Injectable()
export class LogoVerificationService {
  private readonly logger = new Logger(LogoVerificationService.name);

  private readonly defaultProvider: LogoVlmProvider;

  private readonly geminiApiKey?: string;
  private readonly geminiModel: string;

  private readonly openAiApiKey?: string;
  private readonly openAiModel: string;

  private readonly anthropicApiKey?: string;
  private readonly anthropicModel: string;

  constructor() {
    this.defaultProvider = (process.env.LOGO_VLM_PROVIDER || 'gemini') as LogoVlmProvider;

    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiModel = process.env.GEMINI_LOGO_VERIFICATION_MODEL || 'gemini-2.5-flash';

    this.openAiApiKey = process.env.OPENAI_API_KEY;
    this.openAiModel = process.env.OPENAI_LOGO_VERIFICATION_MODEL || 'gpt-4.1-mini';

    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    this.anthropicModel = process.env.ANTHROPIC_LOGO_VERIFICATION_MODEL || 'claude-sonnet-4-5';
  }

  async verifyLogo(input: LogoVerificationInput): Promise<LogoVerificationResult> {
    return this.verifyLogoWithProvider(this.defaultProvider, input);
  }

  async verifyLogoWithProvider(
    provider: LogoVlmProvider,
    input: LogoVerificationInput
  ): Promise<LogoVerificationResult> {
    try {
      const { buffer, contentType } = await this.prepareImage(input.logoUrl);
      return this.runProvider(provider, input, buffer, contentType);
    } catch (e: any) {
      return this.getFallback(`provider_failed:${provider}:${e.message}`);
    }
  }

  async verifyLogoWithAllProviders(input: LogoVerificationInput) {
    const providers: LogoVlmProvider[] = ['gemini', 'openai', 'anthropic'];
    const results: any = {};

    for (const p of providers) {
      results[p] = await this.verifyLogoWithProvider(p, input);
    }

    return {
      providers: results,
      decision: this.buildDecision(results),
    };
  }

  private buildDecision(results): LogoDecision {
    const g = results.gemini;
    const o = results.openai;

    if (!g) return 'review';

    if (g.verdict === 'mismatch' && g.confidence === 'high') {
      return 'reject';
    }

    if (g.verdict === 'mismatch' && o?.verdict === 'mismatch') {
      return 'reject';
    }

    if (
      g.verdict === 'verified' &&
      o?.verdict === 'verified'
    ) {
      return 'accept';
    }

    return 'review';
  }

  private async runProvider(
    provider: LogoVlmProvider,
    input: LogoVerificationInput,
    buffer: Buffer,
    contentType: string
  ) {
    switch (provider) {
      case 'gemini':
        return this.verifyWithGemini(input, buffer, contentType);
      case 'openai':
        return this.verifyWithOpenAI(input, buffer, contentType);
      case 'anthropic':
        return this.verifyWithAnthropic(input, buffer, contentType);
      default:
        return this.getFallback('unsupported_provider');
    }
  }

  private async verifyWithGemini(input, buffer, contentType) {
    if (!this.geminiApiKey) throw new Error('GEMINI_API_KEY missing');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: contentType,
                    data: buffer.toString('base64'),
                  },
                },
                { text: this.prompt(input) },
              ],
            },
          ],
        }),
      }
    );

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.parse(text);
  }

  private async verifyWithOpenAI(input, buffer, contentType) {
    if (!this.openAiApiKey) throw new Error('OPENAI_API_KEY missing');

    const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.openAiModel,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: this.prompt(input) },
              { type: 'input_image', image_url: dataUrl },
            ],
          },
        ],
      }),
    });

    const json = await res.json();
    return this.parse(json.output_text || '');
  }

  private async verifyWithAnthropic(input, buffer, contentType) {
    if (!this.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY missing');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.anthropicModel,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: contentType,
                  data: buffer.toString('base64'),
                },
              },
              { type: 'text', text: this.prompt(input) },
            ],
          },
        ],
      }),
    });

    const json = await res.json();
    return this.parse(json?.content?.[0]?.text || '');
  }

  private prompt(input: LogoVerificationInput) {
    return `
Expected company: ${input.teamName}
Website: ${input.website}

Identify logo brand and verify match.

Return JSON:
{
  "predictedCompanyName": string | null,
  "verdict": "verified" | "weak_match" | "mismatch" | "unverifiable",
  "confidence": "high" | "medium" | "low",
  "quality": "good" | "poor" | "unusable",
  "hasReadableText": boolean,
  "reason": string,
  "brandSignals": string[]
}
`;
  }

  private parse(text: string): LogoVerificationResult {
    try {
      const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return {
        predictedCompanyName: json.predictedCompanyName || null,
        verdict: json.verdict || 'unverifiable',
        confidence: json.confidence || 'low',
        quality: json.quality || 'unusable',
        hasReadableText: json.hasReadableText || false,
        reason: json.reason || '',
        brandSignals: json.brandSignals || [],
      };
    } catch {
      return this.getFallback('parse_failed');
    }
  }

  private getFallback(reason: string): LogoVerificationResult {
    return {
      predictedCompanyName: null,
      verdict: 'unverifiable',
      confidence: 'low',
      quality: 'unusable',
      hasReadableText: false,
      reason,
      brandSignals: [],
    };
  }

  private async prepareImage(url: string) {
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/png';

    if (contentType.includes('svg')) {
      const png = await sharp(buffer).png().toBuffer();
      return { buffer: png, contentType: 'image/png' };
    }

    return { buffer, contentType };
  }
}
