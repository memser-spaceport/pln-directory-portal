import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MemberCvImportStatus, Prisma } from '@prisma/client';
import { generateObject } from 'ai';
import { randomUUID } from 'crypto';
import { ZodError } from 'zod';
import {
  ApplyMemberCvImport,
  ApplyMemberCvImportResponseSchema,
  ApplyMemberCvImportSchema,
  ParsedCvExperience,
  ParsedCvProfile,
} from 'libs/contracts/src/schema/member-cv-import';
import { AwsService } from '../utils/aws/aws.service';
import { CacheService } from '../utils/cache/cache.service';
import { AiProviderService } from '../shared/ai-provider.service';
import { PrismaService } from '../shared/prisma.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { MembersService } from '../members/members.service';
import {
  CV_IMPORT_MAX_TEXT_CHARS,
  CV_IMPORT_S3_PREFIX,
  MEMBER_CV_PARSE_AI_PROVIDER_ENV,
  YEAR_MONTH_REGEX,
} from './member-cv-imports.constants';
import { CV_PARSE_SYSTEM_PROMPT, CvParseLlmProfileSchema } from './member-cv-parse.schema';
import { assertPdfFile, extractPdfText } from './member-cv-pdf.util';

type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class MemberCvImportsService {
  private readonly logger = new Logger(MemberCvImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsService: AwsService,
    private readonly aiProvider: AiProviderService,
    private readonly membersService: MembersService,
    private readonly locationTransferService: LocationTransferService,
    private readonly cacheService: CacheService
  ) {}

  async upload(memberUid: string, file: MulterFile, requestorEmail: string) {
    await this.assertCanManage(memberUid, requestorEmail);
    await this.assertMemberExists(memberUid);
    assertPdfFile(file);

    const bucket = process.env.AWS_S3_UPLOAD_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
    if (!bucket) {
      throw new BadRequestException('File storage is not configured');
    }

    const importUid = randomUUID();
    const s3Key = `${CV_IMPORT_S3_PREFIX}/${importUid}.pdf`;
    const originalFilename = file.originalname || 'cv.pdf';

    await this.awsService.uploadFileToS3({ buffer: file.buffer, mimetype: 'application/pdf' }, bucket, s3Key);

    const existing = await this.prisma.memberCvImport.findUnique({ where: { memberUid } });
    if (existing) {
      await this.prisma.memberCvImport.update({
        where: { memberUid },
        data: {
          uid: importUid,
          status: MemberCvImportStatus.PROCESSING,
          originalFilename,
          s3Bucket: bucket,
          s3Key,
          payload: Prisma.DbNull,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (existing.s3Key && existing.s3Key !== s3Key) {
        await this.awsService.deleteObjectFromS3(existing.s3Bucket, existing.s3Key).catch((error) => {
          this.logger.error(`Failed to delete previous CV object ${existing.s3Key}: ${error}`);
        });
      }
    } else {
      await this.prisma.memberCvImport.create({
        data: {
          uid: importUid,
          memberUid,
          status: MemberCvImportStatus.PROCESSING,
          originalFilename,
          s3Bucket: bucket,
          s3Key,
        },
      });
    }

    void this.runParse(memberUid, importUid, file.buffer).catch((error) => {
      this.logger.error(`CV parse failed for ${importUid}: ${error}`);
    });

    return { uid: importUid, status: MemberCvImportStatus.PROCESSING };
  }

  async getLatest(memberUid: string, requestorEmail: string) {
    await this.assertCanManage(memberUid, requestorEmail);
    const row = await this.prisma.memberCvImport.findUnique({ where: { memberUid } });
    if (!row) {
      throw new NotFoundException('No CV import found for this member');
    }

    const response: {
      uid: string;
      status: MemberCvImportStatus;
      originalFilename: string;
      payload?: ParsedCvProfile;
      error?: { code: string; message: string };
    } = {
      uid: row.uid,
      status: row.status,
      originalFilename: row.originalFilename,
    };

    if (row.status === MemberCvImportStatus.SUCCEEDED && row.payload) {
      response.payload = row.payload as ParsedCvProfile;
    }
    if (row.status === MemberCvImportStatus.FAILED) {
      response.error = {
        code: row.errorCode || 'PARSE_FAILED',
        message: row.errorMessage || 'Failed to parse the CV',
      };
    }

    return response;
  }

  async apply(memberUid: string, body: unknown, requestorEmail: string) {
    await this.assertCanManage(memberUid, requestorEmail);
    const selection = this.parseApplyBody(body);

    const row = await this.prisma.memberCvImport.findUnique({ where: { memberUid } });
    if (!row) {
      throw new NotFoundException('No CV import found for this member');
    }
    if (row.status !== MemberCvImportStatus.SUCCEEDED) {
      throw new ConflictException('Latest CV parse has not succeeded');
    }
    if (row.uid !== selection.importUid) {
      throw new ConflictException('Import is stale; fetch the latest parse and review again');
    }

    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      include: { skills: { select: { uid: true, title: true } } },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const shouldFillRole = !member.role?.trim() && !!selection.role.trim();
    const shouldFillLocation = !member.locationUid && !!selection.location.trim();
    const skillsAdded: string[] = [];
    let locationApplied = false;

    await this.prisma.$transaction(async (tx) => {
      const skillConnect = await this.unionSkills(tx, member.skills, selection.skills);
      skillsAdded.push(...skillConnect.addedTitles);

      const memberUpdate: Prisma.MemberUpdateInput = {};
      if (shouldFillRole) {
        memberUpdate.role = selection.role.trim();
      }
      if (skillConnect.connect.length > 0) {
        memberUpdate.skills = { connect: skillConnect.connect };
      }
      if (shouldFillLocation) {
        const locationUid = await this.resolveLocationUid(tx, selection.location.trim());
        if (locationUid) {
          memberUpdate.location = { connect: { uid: locationUid } };
          locationApplied = true;
        }
      }

      if (Object.keys(memberUpdate).length > 0) {
        await tx.member.update({ where: { uid: memberUid }, data: memberUpdate });
      }

      for (const experience of selection.experiences) {
        await tx.memberExperience.create({
          data: {
            title: experience.title.trim(),
            company: experience.company.trim(),
            location: experience.location.trim() || null,
            description: experience.description || null,
            startDate: yearMonthToDate(experience.startDate),
            endDate: experience.isCurrent ? null : experience.endDate ? yearMonthToDate(experience.endDate) : null,
            isCurrent: experience.isCurrent,
            isModifiedByUser: true,
            userUpdatedAt: new Date(),
            member: { connect: { uid: memberUid } },
          },
        });
      }
    });

    await this.cacheService.reset({ service: 'members' });

    const updated = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: { role: true },
    });

    return ApplyMemberCvImportResponseSchema.parse({
      uid: memberUid,
      role: updated?.role ?? null,
      locationApplied,
      skillsAdded,
      experiencesAdded: selection.experiences.length,
    });
  }

  async runParse(memberUid: string, importUid: string, buffer: Buffer): Promise<void> {
    try {
      const text = await extractPdfText(buffer);
      if (!text) {
        await this.finishIfCurrent(memberUid, importUid, {
          status: MemberCvImportStatus.FAILED,
          errorCode: 'UNREADABLE_PDF',
          errorMessage: 'The PDF has no extractable text',
        });
        return;
      }

      const truncated = text.length > CV_IMPORT_MAX_TEXT_CHARS ? text.slice(0, CV_IMPORT_MAX_TEXT_CHARS) : text;
      const { object } = await generateObject({
        model: this.aiProvider.getResponsesModel(MEMBER_CV_PARSE_AI_PROVIDER_ENV, { useSearchGrounding: false }),
        schema: CvParseLlmProfileSchema,
        system: CV_PARSE_SYSTEM_PROMPT,
        prompt: `Extract the profile from this CV text:\n\n${truncated}`,
        temperature: 0,
      });

      const payload = normalizeParsedProfile(object);
      if (payload.experiences.length === 0) {
        await this.finishIfCurrent(memberUid, importUid, {
          status: MemberCvImportStatus.NOTHING_FOUND,
          payload: Prisma.DbNull,
        });
        return;
      }

      await this.finishIfCurrent(memberUid, importUid, {
        status: MemberCvImportStatus.SUCCEEDED,
        payload: payload as unknown as Prisma.InputJsonValue,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`CV parse error for ${importUid}: ${message}`);
      await this.finishIfCurrent(memberUid, importUid, {
        status: MemberCvImportStatus.FAILED,
        errorCode: 'PARSE_FAILED',
        errorMessage: 'Failed to parse the CV',
      });
    }
  }

  private async finishIfCurrent(
    memberUid: string,
    importUid: string,
    data: Prisma.MemberCvImportUpdateInput
  ): Promise<void> {
    await this.prisma.memberCvImport.updateMany({
      where: { memberUid, uid: importUid },
      data,
    });
  }

  private async assertCanManage(memberUid: string, requestorEmail: string) {
    const requestor = await this.membersService.findMemberByEmail(requestorEmail);
    if (!requestor) {
      throw new NotFoundException(`Requestor not found for ${requestorEmail}`);
    }
    if (memberUid !== requestor.uid && !requestor.isDirectoryAdmin) {
      throw new ForbiddenException(`Member isn't authorized to update the member`);
    }
    return requestor;
  }

  private async assertMemberExists(memberUid: string) {
    const member = await this.prisma.member.findUnique({ where: { uid: memberUid }, select: { uid: true } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
  }

  private parseApplyBody(body: unknown): ApplyMemberCvImport {
    try {
      return ApplyMemberCvImportSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        const startDateIssue = error.issues.find((issue) => issue.path.includes('startDate'));
        if (startDateIssue) {
          throw new BadRequestException('Each experience must have a start date (YYYY-MM)');
        }
        throw new BadRequestException(error.issues.map((issue) => issue.message).join('; '));
      }
      throw error;
    }
  }

  private async unionSkills(
    tx: Prisma.TransactionClient,
    existing: Array<{ uid: string; title: string }>,
    titles: string[]
  ): Promise<{ connect: Array<{ uid: string }>; addedTitles: string[] }> {
    const existingUids = new Set(existing.map((skill) => skill.uid));
    const connect: Array<{ uid: string }> = [];
    const addedTitles: string[] = [];
    const seen = new Set<string>();

    for (const raw of titles) {
      const title = raw.trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      let skill = await tx.skill.findFirst({
        where: { title: { equals: title, mode: 'insensitive' } },
        select: { uid: true, title: true },
      });
      if (!skill) {
        try {
          skill = await tx.skill.create({ data: { title }, select: { uid: true, title: true } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            skill = await tx.skill.findFirst({
              where: { title: { equals: title, mode: 'insensitive' } },
              select: { uid: true, title: true },
            });
          } else {
            throw error;
          }
        }
      }
      if (!skill || existingUids.has(skill.uid)) continue;
      existingUids.add(skill.uid);
      connect.push({ uid: skill.uid });
      addedTitles.push(skill.title);
    }

    return { connect, addedTitles };
  }

  private async resolveLocationUid(tx: Prisma.TransactionClient, location: string): Promise<string | null> {
    try {
      const result = await this.locationTransferService.fetchLocation(location, '', null, null, null);
      if (!result?.location?.placeId || !result.location.country) {
        return null;
      }
      const finalLocation = await tx.location.upsert({
        where: { placeId: result.location.placeId },
        update: result.location,
        create: result.location,
      });
      return finalLocation?.uid ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`CV import location geocode failed: ${message}`);
      return null;
    }
  }
}

export function yearMonthToDate(value: string): Date {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function normalizeYearMonth(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (YEAR_MONTH_REGEX.test(trimmed)) return trimmed;
  const yearMonth = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (yearMonth) {
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) {
      return `${yearMonth[1]}-${String(month).padStart(2, '0')}`;
    }
  }
  return '';
}

export function normalizeParsedProfile(raw: {
  role?: string;
  location?: string;
  skills?: string[];
  experiences?: Array<{
    title?: string;
    company?: string;
    description?: string;
    startDate?: string;
    endDate?: string | null;
    isCurrent?: boolean;
    location?: string;
  }>;
}): ParsedCvProfile {
  const experiences: ParsedCvExperience[] = (raw.experiences ?? [])
    .map((experience, index) => {
      const isCurrent = Boolean(experience.isCurrent);
      return {
        key: `parsed-${index + 1}`,
        title: (experience.title ?? '').trim(),
        company: (experience.company ?? '').trim(),
        description: toHtmlParagraph(experience.description ?? ''),
        startDate: normalizeYearMonth(experience.startDate),
        endDate: isCurrent ? null : normalizeYearMonth(experience.endDate) || null,
        isCurrent,
        location: (experience.location ?? '').trim(),
      };
    })
    .filter((experience) => experience.title && experience.company);

  return {
    role: (raw.role ?? '').trim(),
    location: (raw.location ?? '').trim(),
    skills: uniqueTrimmed(raw.skills ?? []),
    experiences,
  };
}

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function toHtmlParagraph(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  const escaped = trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
}
