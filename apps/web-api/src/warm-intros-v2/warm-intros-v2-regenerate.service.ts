import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { DataEnrichmentClientService } from '../data-enrichment-client/data-enrichment-client.service';
import { WarmIntrosV2RunService, WarmIntrosV2RunView } from './warm-intros-v2-run.service';

export type RegenerateWarmIntroResult =
  | { status: 'started'; uid: string }
  | { status: 'already_running'; uid: string };

@Injectable()
export class WarmIntrosV2RegenerateService {
  private readonly logger = new Logger(WarmIntrosV2RegenerateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: WarmIntrosV2RunService,
    private readonly dataEnrichment: DataEnrichmentClientService,
  ) {}

  async regenerate(investorProfileUid: string): Promise<RegenerateWarmIntroResult> {
    const uid = investorProfileUid.trim();
    const profile = await this.prisma.masterProfile.findUnique({
      where: { uid },
      select: { uid: true, affinityPersonId: true },
    });
    if (!profile) throw new NotFoundException(`MasterProfile not found: ${uid}`);
    if (!profile.affinityPersonId?.trim()) {
      throw new BadRequestException('Investor has no Affinity person id');
    }

    const claim = await this.runs.claimInvestor(uid);
    if (claim.action === 'skipped') return { status: 'already_running', uid: claim.uid };

    try {
      await this.dataEnrichment.triggerWarmIntroInvestorRefresh(uid, claim.uid);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.runs.finish(claim.uid, 'FAILED', message).catch((finishError) => {
        this.logger.error(
          `could not mark investor refresh ${claim.uid} failed: ${
            finishError instanceof Error ? finishError.message : String(finishError)
          }`,
        );
      });
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to start investor refresh');
    }

    return { status: 'started', uid: claim.uid };
  }

  latest(investorProfileUid: string): Promise<{ run: WarmIntrosV2RunView | null }> {
    return this.runs.latestForInvestor(investorProfileUid);
  }
}
