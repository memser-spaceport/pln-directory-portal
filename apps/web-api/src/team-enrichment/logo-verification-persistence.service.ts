import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogoVerificationResult } from './logo-verification.types';

@Injectable()
export class LogoVerificationPersistenceService {
  private readonly logger = new Logger(LogoVerificationPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTeamsForVerification(limit = 20): Promise<Array<{
    uid: string;
    name: string;
    website: string | null;
    logoUid: string | null;
    logo: { uid: string; url: string } | null;
  }>> {
    return this.prisma.team.findMany({
      where: {
        logoUid: { not: null },
      },
      select: {
        uid: true,
        name: true,
        website: true,
        logoUid: true,
        logo: {
          select: {
            uid: true,
            url: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
    });
  }

  async shouldVerifyTeam(params: {
    teamUid: string;
    logoUid: string | null;
    provider: string;
    model: string | null;
    force?: boolean;
  }): Promise<boolean> {
    if (params.force) return true;
    if (!params.logoUid) return false;

    const latest = await this.prisma.teamLogoVerificationResult.findFirst({
      where: {
        teamUid: params.teamUid,
        provider: params.provider,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        logoUid: true,
        model: true,
      },
    });

    if (!latest) return true;
    if (latest.logoUid !== params.logoUid) return true;
    if ((latest.model ?? null) !== (params.model ?? null)) return true;

    return false;
  }

  async saveResult(params: {
    teamUid: string;
    logoUid: string | null;
    website: string | null;
    logoUrl: string | null;
    source: string;
    provider: string;
    model: string | null;
    result: LogoVerificationResult;
  }) {
    const saved = await this.prisma.teamLogoVerificationResult.create({
      data: {
        teamUid: params.teamUid,
        logoUid: params.logoUid,
        website: params.website,
        logoUrl: params.logoUrl,
        source: params.source,
        provider: params.provider,
        model: params.model,
        verdict: params.result.verdict,
        confidence: params.result.confidence,
        quality: params.result.quality,
        hasReadableText: params.result.hasReadableText,
        predictedCompanyName: params.result.predictedCompanyName,
        reason: params.result.reason,
        brandSignals: params.result.brandSignals as any,
        rawResponse: params.result as any,
      },
    });

    this.logger.log(
      `Saved logo verification result for team=${params.teamUid}, provider=${params.provider}, verdict=${params.result.verdict}`
    );

    return saved;
  }
}
