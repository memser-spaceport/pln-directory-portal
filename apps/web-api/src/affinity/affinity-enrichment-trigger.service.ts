import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { DataEnrichmentClientService } from '../data-enrichment-client/data-enrichment-client.service';

const COOLDOWN_MS = 60_000;

export interface AffinityRetriggerResponse {
  success: true;
  member_uid: string;
  affinity_person_id: string;
  run_id: string;
  ingest: {
    ingested: { companies: number; persons: number };
    linked: { companiesToTeam: number; personsToMember: number; personsToCompany: number };
    failed: number;
  };
}

@Injectable()
export class AffinityEnrichmentTriggerService {
  private readonly lastTriggeredAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataEnrichmentClient: DataEnrichmentClientService,
  ) {}

  async retriggerForMember(memberUid: string): Promise<AffinityRetriggerResponse> {
    const lastAt = this.lastTriggeredAt.get(memberUid);
    if (lastAt && Date.now() - lastAt < COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((COOLDOWN_MS - (Date.now() - lastAt)) / 1000);
      throw new HttpException(
        `Affinity enrichment was triggered recently. Try again in ${retryAfterSec} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: { uid: true },
    });
    if (!member) {
      throw new NotFoundException(`Member not found: ${memberUid}`);
    }

    const person = await this.prisma.affinityPerson.findFirst({
      where: { memberUid },
      select: { affinityPersonId: true },
    });
    if (!person) {
      throw new NotFoundException(`No Affinity profile linked to member: ${memberUid}`);
    }

    const result = await this.dataEnrichmentClient.triggerAffinityMemberEnrichment(
      person.affinityPersonId,
    );

    this.lastTriggeredAt.set(memberUid, Date.now());

    return {
      success: true,
      member_uid: memberUid,
      affinity_person_id: person.affinityPersonId,
      run_id: result.runId,
      ingest: {
        ingested: result.ingest.ingested,
        linked: result.ingest.linked,
        failed: result.ingest.failed,
      },
    };
  }
}
