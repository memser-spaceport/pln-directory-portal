import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { LogoVerificationService } from './logo-verification.service';
import {
  LogoVerificationAllProvidersResponse,
  LogoVerificationBatchItemResponse,
  LogoVerificationBatchResponse,
  LogoVerificationResult,
  VerifyLogoBatchRequestDto,
  VerifyLogoRequestDto,
} from './logo-verification.types';

@Controller('team-enrichment')
export class LogoVerificationController {
  constructor(
    private readonly logoVerificationService: LogoVerificationService
  ) {}

  @Post('verify-logo')
  @HttpCode(200)
  async verifyLogo(
    @Body() body: VerifyLogoRequestDto
  ): Promise<LogoVerificationResult> {
    return this.logoVerificationService.verifyLogo({
      teamName: body.teamName,
      website: body.website ?? null,
      logoUrl: body.logoUrl,
      source: body.source ?? 'manual',
    });
  }

  @Post('verify-logo/all')
  @HttpCode(200)
  async verifyLogoAll(
    @Body() body: VerifyLogoRequestDto
  ): Promise<LogoVerificationAllProvidersResponse> {
    return this.logoVerificationService.verifyLogoWithAllProviders({
      teamName: body.teamName,
      website: body.website ?? null,
      logoUrl: body.logoUrl,
      source: body.source ?? 'manual',
    });
  }

  @Post('verify-logo/provider/:provider')
  @HttpCode(200)
  async verifyLogoByProvider(
    @Param('provider') provider: string,
    @Body() body: VerifyLogoRequestDto
  ): Promise<LogoVerificationResult> {
    const allowedProviders = ['gemini', 'openai', 'anthropic'] as const;

    if (!allowedProviders.includes(provider as (typeof allowedProviders)[number])) {
      throw new BadRequestException(
        `Unsupported provider "${provider}". Allowed: ${allowedProviders.join(', ')}`
      );
    }

    return this.logoVerificationService.verifyLogoWithProvider(
      provider as 'gemini' | 'openai' | 'anthropic',
      {
        teamName: body.teamName,
        website: body.website ?? null,
        logoUrl: body.logoUrl,
        source: body.source ?? 'manual',
      }
    );
  }

  @Post('verify-logo/batch')
  @HttpCode(200)
  async verifyLogoBatch(
    @Body() body: VerifyLogoBatchRequestDto
  ): Promise<LogoVerificationBatchResponse> {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }

    const mode = body.mode ?? 'all';
    const allowedModes = ['all', 'gemini', 'openai', 'anthropic'] as const;

    if (!allowedModes.includes(mode)) {
      throw new BadRequestException(
        `Unsupported mode "${mode}". Allowed: ${allowedModes.join(', ')}`
      );
    }

    const results: LogoVerificationBatchItemResponse[] = [];

    for (const item of body.items) {
      const input = {
        teamName: item.teamName,
        website: item.website ?? null,
        logoUrl: item.logoUrl,
        source: item.source ?? 'manual',
      };

      let result: LogoVerificationResult | LogoVerificationAllProvidersResponse;

      if (mode === 'all') {
        result = await this.logoVerificationService.verifyLogoWithAllProviders(input);
      } else {
        result = await this.logoVerificationService.verifyLogoWithProvider(mode, input);
      }

      results.push({
        input,
        expected: item.expected ?? null,
        result,
      });
    }

    return {
      total: results.length,
      mode,
      results,
    };
  }
}
