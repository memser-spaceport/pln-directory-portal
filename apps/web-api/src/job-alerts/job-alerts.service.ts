import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JobAlert, Prisma } from '@prisma/client';
import type { JobAlertFilterState } from 'libs/contracts/src/schema/job-alert';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { PrismaService } from '../shared/prisma.service';
import { JobAlertsDispatchService } from './job-alerts-dispatch.service';
import { canonicalizeFilterState, generateAutoName, hashFilterState } from './job-alerts.utils';

@Injectable()
export class JobAlertsService {
  private readonly logger = new Logger(JobAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobOpeningsQueryService: JobOpeningsQueryService,
    private readonly dispatchService: JobAlertsDispatchService,
  ) {}

  async resolveMemberUidByEmail(email: string | undefined): Promise<string> {
    if (!email) {
      throw new UnauthorizedException('Authenticated email required');
    }
    const member = await this.prisma.member.findUnique({
      where: { email },
      select: { uid: true, deletedAt: true },
    });
    if (!member || member.deletedAt) {
      throw new UnauthorizedException('Member not found');
    }
    return member.uid;
  }

  async list(memberUid: string) {
    const alerts = await this.prisma.jobAlert.findMany({
      where: { memberUid, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const items = alerts.map((alert) => this.toResponseShape(alert));
    return {
      items,
      total: items.length,
    };
  }

  async create(memberUid: string, input: { name?: string; filterState: JobAlertFilterState }) {
    const canonical = canonicalizeFilterState(input.filterState);
    if (!this.hasAtLeastOneFilter(canonical)) {
      throw new BadRequestException('Cannot save a job alert with no filters applied');
    }

    const filterStateHash = hashFilterState(canonical);
    const name = (input.name?.trim() || generateAutoName(canonical)).slice(0, 120);

    let alert: JobAlert;
    try {
      alert = await this.prisma.jobAlert.create({
        data: {
          memberUid,
          name,
          filterState: canonical as unknown as Prisma.InputJsonValue,
          filterStateHash,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.jobAlert.findFirst({
          where: { memberUid, deletedAt: null },
          select: { uid: true },
        });
        throw new ConflictException({
          existingAlertUid: existing?.uid ?? null,
          message: 'You already have a job alert. Update it to change the filters.',
        });
      }
      throw err;
    }

    void this.sendConfirmationFireAndForget(alert.uid).catch((sendErr) => {
      this.logger.error(`Confirmation email failed for alert ${alert.uid}: ${(sendErr as Error).message}`);
    });

    return this.toResponseShape(alert);
  }

  private async sendConfirmationFireAndForget(alertUid: string): Promise<void> {
    const alert = await this.prisma.jobAlert.findUnique({
      where: { uid: alertUid },
      select: {
        uid: true,
        name: true,
        filterState: true,
        member: { select: { email: true } },
      },
    });
    if (!alert?.member?.email) return;

    const filterState = alert.filterState as unknown as JobAlertFilterState;
    const matches = await this.jobOpeningsQueryService.findNewMatchesSince(
      { ...filterState, page: 1, limit: 50, sort: 'newest' },
      null,
    );
    if (matches.length === 0) return;

    await this.dispatchService.sendConfirmationEmail({
      alertUid: alert.uid,
      alertName: alert.name,
      memberEmail: alert.member.email,
      matches,
      filterState,
    });
  }

  async update(
    memberUid: string,
    uid: string,
    patch: { name?: string; filterState?: JobAlertFilterState },
  ) {
    const existing = await this.prisma.jobAlert.findFirst({
      where: { uid, memberUid, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Job alert not found');

    const data: Prisma.JobAlertUpdateInput = {};
    if (typeof patch.name === 'string') {
      const trimmed = patch.name.trim();
      if (!trimmed) throw new BadRequestException('Name cannot be empty');
      data.name = trimmed.slice(0, 120);
    }
    if (patch.filterState) {
      const canonical = canonicalizeFilterState(patch.filterState);
      if (!this.hasAtLeastOneFilter(canonical)) {
        throw new BadRequestException('Cannot save a job alert with no filters applied');
      }
      data.filterState = canonical as unknown as Prisma.InputJsonValue;
      data.filterStateHash = hashFilterState(canonical);
    }

    const updated = await this.prisma.jobAlert.update({
      where: { uid },
      data,
    });
    return this.toResponseShape(updated);
  }

  async delete(memberUid: string, uid: string): Promise<void> {
    const existing = await this.prisma.jobAlert.findFirst({
      where: { uid, memberUid, deletedAt: null },
      select: { uid: true, filterStateHash: true },
    });
    if (!existing) throw new NotFoundException('Job alert not found');
    await this.prisma.jobAlert.update({
      where: { uid },
      data: {
        deletedAt: new Date(),
        filterStateHash: `${existing.filterStateHash}#deleted:${uid}`,
      },
    });
  }

  private hasAtLeastOneFilter(canonical: JobAlertFilterState): boolean {
    return Boolean(
      canonical.q ||
        canonical.roleCategory.length ||
        canonical.seniority.length ||
        canonical.focus.length ||
        canonical.location.length ||
        canonical.workMode.length,
    );
  }

  private toResponseShape(alert: JobAlert) {
    const filterState = alert.filterState as unknown as JobAlertFilterState;
    return {
      uid: alert.uid,
      name: alert.name,
      filterState,
      createdAt: alert.createdAt.toISOString(),
      updatedAt: alert.updatedAt.toISOString(),
    };
  }
}
