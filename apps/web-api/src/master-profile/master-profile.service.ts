import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  IngestMasterProfileDto,
  IngestMasterProfileResponse,
  ListMasterProfilesQueryDto,
  MasterProfileInput,
} from './dto/ingest-master-profile.dto';

/**
 * MasterProfile write + read. Ingest upserts by personKey; no enrichment logic.
 *
 * curl example (service secret):
 *   curl -X POST "$API/v1/service/master-profiles/ingest" \
 *     -H "Authorization: Bearer $INTERNAL_SERVICE_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"profiles":[{"personKey":"affinity:123","types":["investor"],"canonicalName":"Ada"}]}'
 */
@Injectable()
export class MasterProfileService {
  private readonly logger = new Logger(MasterProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(dto: IngestMasterProfileDto): Promise<IngestMasterProfileResponse> {
    if (!Array.isArray(dto.profiles)) {
      throw new BadRequestException('profiles array is required');
    }

    const errors: string[] = [];
    dto.profiles.forEach((p, i) => {
      if (!p.personKey || typeof p.personKey !== 'string' || p.personKey.trim() === '') {
        errors.push(`profiles[${i}]: personKey is required`);
      }
      if (!p.canonicalName || typeof p.canonicalName !== 'string' || p.canonicalName.trim() === '') {
        errors.push(`profiles[${i}]: canonicalName is required`);
      }
      if (p.types !== undefined && !Array.isArray(p.types)) {
        errors.push(`profiles[${i}]: types must be an array`);
      }
    });
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'invalid profiles', errors });
    }

    let created = 0;
    let updated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const profile of dto.profiles) {
        const personKey = profile.personKey.trim();
        const data = this.toUpsertData(profile);
        const existing = await tx.masterProfile.findUnique({
          where: { personKey },
          select: { uid: true },
        });
        if (existing) {
          await tx.masterProfile.update({ where: { personKey }, data });
          updated += 1;
        } else {
          await tx.masterProfile.create({ data: { personKey, ...data } });
          created += 1;
        }
      }
    });

    const upserted = created + updated;
    this.logger.log(
      `master-profile ingest: received=${dto.profiles.length} created=${created} ` +
        `updated=${updated} runId=${dto.runId ?? 'none'}`
    );

    return {
      runId: dto.runId,
      received: dto.profiles.length,
      upserted,
      created,
      updated,
    };
  }

  async getByUid(uid: string) {
    const profile = await this.prisma.masterProfile.findUnique({ where: { uid } });
    if (!profile) {
      throw new NotFoundException(`MasterProfile not found: ${uid}`);
    }
    return profile;
  }

  /**
   * Unique-key lookup (personKey / affinityPersonId / memberUid / investorOutreachId)
   * returns a single profile or 404. Otherwise list by type / all, capped by limit.
   */
  async lookup(query: ListMasterProfilesQueryDto) {
    const personKey = query.personKey?.trim() || null;
    const affinityPersonId = query.affinityPersonId?.trim() || null;
    const memberUid = query.memberUid?.trim() || null;
    const investorOutreachId = query.investorOutreachId?.trim() || null;
    const type = query.type?.trim() || null;

    if (personKey || affinityPersonId || memberUid || investorOutreachId) {
      const where: Prisma.MasterProfileWhereInput = {};
      if (personKey) where.personKey = personKey;
      else if (affinityPersonId) where.affinityPersonId = affinityPersonId;
      else if (memberUid) where.memberUid = memberUid;
      else if (investorOutreachId) where.investorOutreachId = investorOutreachId;
      if (type) where.types = { has: type };

      const profile = personKey
        ? await this.prisma.masterProfile.findUnique({ where: { personKey } })
        : await this.prisma.masterProfile.findFirst({ where });

      if (!profile || (personKey && type && !profile.types.includes(type))) {
        throw new NotFoundException('MasterProfile not found');
      }
      return { profile };
    }

    const limit = Math.min(Math.max(parseInt(query.limit ?? '20', 10) || 20, 1), 100);
    const where: Prisma.MasterProfileWhereInput = {};
    if (type) where.types = { has: type };

    const profiles = await this.prisma.masterProfile.findMany({
      where,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });
    return { profiles };
  }

  private toUpsertData(profile: MasterProfileInput): Omit<Prisma.MasterProfileCreateInput, 'personKey'> {
    return {
      types: Array.isArray(profile.types) ? profile.types : [],
      canonicalName: profile.canonicalName.trim(),
      memberUid: profile.memberUid ?? null,
      affinityPersonId: profile.affinityPersonId ?? null,
      investorOutreachId: profile.investorOutreachId ?? null,
      emails: this.jsonOrNull(profile.emails),
      phones: this.jsonOrNull(profile.phones),
      socials: this.jsonOrNull(profile.socials),
      organizations: this.jsonOrNull(profile.organizations),
      experience: this.jsonOrNull(profile.experience),
      education: this.jsonOrNull(profile.education),
      investorMeta: this.jsonOrNull(profile.investorMeta),
      funds: this.jsonOrNull(profile.funds),
      investedIn: this.jsonOrNull(profile.investedIn),
      locations: this.jsonOrNull(profile.locations),
      listMemberships: this.jsonOrNull(profile.listMemberships),
      raw: this.jsonOrNull(profile.raw),
      sourceSnapshots: this.jsonOrNull(profile.sourceSnapshots),
      currentOrg: profile.currentOrg ?? null,
      currentTitle: profile.currentTitle ?? null,
      bio: profile.bio ?? null,
      contentHash: profile.contentHash ?? null,
      enrichmentVersion: profile.enrichmentVersion ?? null,
      enrichedAt: this.parseEnrichedAt(profile.enrichedAt),
    };
  }

  private jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (value === undefined || value === null) return Prisma.DbNull;
    return value as Prisma.InputJsonValue;
  }

  private parseEnrichedAt(value: string | null | undefined): Date {
    if (value === null) return new Date();
    if (value === undefined || value.trim() === '') return new Date();
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`invalid enrichedAt: ${value}`);
    }
    return d;
  }
}
