jest.mock('ai', () => ({
  generateObject: jest.fn(),
}));
jest.mock('@ai-sdk/openai', () => ({ openai: { responses: jest.fn() } }));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));
jest.mock('./member-cv-pdf.util', () => {
  const actual = jest.requireActual('./member-cv-pdf.util');
  return {
    ...actual,
    extractPdfText: jest.fn(),
  };
});
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class CacheService {} }));
jest.mock('../utils/location-transfer/location-transfer.service', () => ({
  LocationTransferService: class LocationTransferService {},
}));
jest.mock('../utils/aws/aws.service', () => ({ AwsService: class AwsService {} }));
jest.mock('../members/members.service', () => ({ MembersService: class MembersService {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../shared/ai-provider.service', () => ({ AiProviderService: class AiProviderService {} }));

import { generateObject } from 'ai';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MemberCvImportStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { AiProviderService } from '../shared/ai-provider.service';
import { MembersService } from '../members/members.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { CacheService } from '../utils/cache/cache.service';
import { extractPdfText } from './member-cv-pdf.util';
import { MemberCvImportsService } from './member-cv-imports.service';

const generateObjectMock = generateObject as jest.MockedFunction<typeof generateObject>;
const extractPdfTextMock = extractPdfText as jest.MockedFunction<typeof extractPdfText>;

const OWNER = { uid: 'member-1', isDirectoryAdmin: false };
const ADMIN = { uid: 'admin-1', isDirectoryAdmin: true };
const TEAM_LEAD = { uid: 'lead-1', isDirectoryAdmin: false, leadingTeams: ['team-1'] };
const PDF_BUFFER = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('fake-pdf-body')]);
const PDF_FILE = {
  buffer: PDF_BUFFER,
  mimetype: 'application/pdf',
  originalname: 'cv.pdf',
  size: PDF_BUFFER.length,
};

describe('MemberCvImportsService', () => {
  const memberFindUnique = jest.fn();
  const memberUpdate = jest.fn();
  const cvFindUnique = jest.fn();
  const cvCreate = jest.fn();
  const cvUpdate = jest.fn();
  const cvUpdateMany = jest.fn();
  const cvDelete = jest.fn();
  const skillFindFirst = jest.fn();
  const skillCreate = jest.fn();
  const locationUpsert = jest.fn();
  const experienceCreate = jest.fn();
  const jobApplicationFindFirst = jest.fn();
  const transaction = jest.fn();

  const prisma = {
    member: { findUnique: memberFindUnique, update: memberUpdate },
    memberCvImport: {
      findUnique: cvFindUnique,
      create: cvCreate,
      update: cvUpdate,
      updateMany: cvUpdateMany,
      delete: cvDelete,
    },
    skill: { findFirst: skillFindFirst, create: skillCreate },
    location: { upsert: locationUpsert },
    memberExperience: { create: experienceCreate },
    jobApplication: { findFirst: jobApplicationFindFirst },
    $transaction: transaction,
  } as unknown as PrismaService;

  const awsService = {
    uploadFileToS3: jest.fn().mockResolvedValue({ Location: '' }),
    deleteObjectFromS3: jest.fn().mockResolvedValue(undefined),
    getSignedGetUrl: jest.fn().mockResolvedValue('https://signed.example/cv.pdf'),
    getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
  } as unknown as AwsService;

  const aiProvider = {
    getResponsesModel: jest.fn().mockReturnValue('mock-model'),
  } as unknown as AiProviderService;

  const membersService = {
    findMemberByEmail: jest.fn(),
  } as unknown as MembersService;

  const locationTransferService = {
    fetchLocation: jest.fn(),
  } as unknown as LocationTransferService;

  const cacheService = {
    reset: jest.fn().mockResolvedValue(undefined),
  } as unknown as CacheService;

  let service: MemberCvImportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_S3_UPLOAD_BUCKET_NAME = 'test-uploads';
    (membersService.findMemberByEmail as jest.Mock).mockResolvedValue(OWNER);
    memberFindUnique.mockResolvedValue({ uid: 'member-1', role: null, locationUid: null, skills: [] });
    cvFindUnique.mockResolvedValue(null);
    cvCreate.mockResolvedValue({});
    cvUpdate.mockResolvedValue({});
    cvUpdateMany.mockResolvedValue({ count: 1 });
    jobApplicationFindFirst.mockResolvedValue(null);
    transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    service = new MemberCvImportsService(
      prisma,
      awsService,
      aiProvider,
      membersService,
      locationTransferService,
      cacheService
    );
  });

  describe('upload', () => {
    it('rejects a non-PDF', async () => {
      await expect(
        service.upload(
          'member-1',
          { ...PDF_FILE, mimetype: 'application/msword', buffer: Buffer.from('not-a-pdf') },
          'owner@example.com'
        )
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(awsService.uploadFileToS3).not.toHaveBeenCalled();
    });

    it('rejects an oversized file', async () => {
      await expect(
        service.upload('member-1', { ...PDF_FILE, size: 6 * 1024 * 1024 }, 'owner@example.com')
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forbids another member', async () => {
      await expect(service.upload('member-2', PDF_FILE, 'owner@example.com')).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it('allows a directory admin to upload for another member', async () => {
      (membersService.findMemberByEmail as jest.Mock).mockResolvedValue(ADMIN);
      jest.spyOn(service, 'runParse').mockResolvedValue(undefined);

      const result = await service.upload('member-1', PDF_FILE, 'admin@example.com');

      expect(result.status).toBe(MemberCvImportStatus.PROCESSING);
      expect(awsService.uploadFileToS3).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: 'application/pdf' }),
        'test-uploads',
        expect.stringMatching(/^cvs\/.+\.pdf$/)
      );
      expect(cvCreate).toHaveBeenCalled();
    });

    it('replaces the previous S3 object on a later upload', async () => {
      jest.spyOn(service, 'runParse').mockResolvedValue(undefined);
      cvFindUnique.mockResolvedValue({
        uid: 'old-uid',
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/old.pdf',
      });

      await service.upload('member-1', PDF_FILE, 'owner@example.com');

      expect(cvUpdate).toHaveBeenCalled();
      expect(awsService.deleteObjectFromS3).toHaveBeenCalledWith('test-uploads', 'cvs/old.pdf');
    });

    it('stamps fileSizeBytes and uploadedAt on upload', async () => {
      jest.spyOn(service, 'runParse').mockResolvedValue(undefined);

      await service.upload('member-1', PDF_FILE, 'owner@example.com');

      expect(cvCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileSizeBytes: PDF_FILE.size,
            uploadedAt: expect.any(Date),
          }),
        })
      );
    });

    it('stamps fileSizeBytes and uploadedAt on replace', async () => {
      jest.spyOn(service, 'runParse').mockResolvedValue(undefined);
      cvFindUnique.mockResolvedValue({
        uid: 'old-uid',
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/old.pdf',
      });

      await service.upload('member-1', PDF_FILE, 'owner@example.com');

      expect(cvUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileSizeBytes: PDF_FILE.size,
            uploadedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('runParse', () => {
    it('marks SUCCEEDED when experiences are found', async () => {
      extractPdfTextMock.mockResolvedValue('Senior Engineer at Lattice');
      generateObjectMock.mockResolvedValue({
        object: {
          role: 'Engineer',
          location: 'Berlin, Germany',
          skills: ['Rust'],
          experiences: [
            {
              title: 'Engineer',
              company: 'Lattice',
              description: 'Built things',
              startDate: '2021-03',
              endDate: null,
              isCurrent: true,
              location: 'Berlin',
            },
          ],
        },
      } as never);

      await service.runParse('member-1', 'import-1', PDF_BUFFER);

      expect(cvUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { memberUid: 'member-1', uid: 'import-1' },
          data: expect.objectContaining({
            status: MemberCvImportStatus.SUCCEEDED,
            payload: expect.objectContaining({
              role: 'Engineer',
              experiences: [expect.objectContaining({ company: 'Lattice', key: 'parsed-1' })],
            }),
          }),
        })
      );
    });

    it('marks NOTHING_FOUND when no extractable roles exist', async () => {
      extractPdfTextMock.mockResolvedValue('A portfolio with no jobs');
      generateObjectMock.mockResolvedValue({
        object: { role: '', location: '', skills: [], experiences: [] },
      } as never);

      await service.runParse('member-1', 'import-1', PDF_BUFFER);

      expect(cvUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MemberCvImportStatus.NOTHING_FOUND }),
        })
      );
    });

    it('marks FAILED when the PDF has no extractable text', async () => {
      extractPdfTextMock.mockResolvedValue('');

      await service.runParse('member-1', 'import-1', PDF_BUFFER);

      expect(generateObjectMock).not.toHaveBeenCalled();
      expect(cvUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MemberCvImportStatus.FAILED,
            errorCode: 'UNREADABLE_PDF',
          }),
        })
      );
    });

    it('marks FAILED when the extractor throws', async () => {
      extractPdfTextMock.mockRejectedValue(new Error('corrupt'));

      await service.runParse('member-1', 'import-1', PDF_BUFFER);

      expect(cvUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MemberCvImportStatus.FAILED,
            errorCode: 'PARSE_FAILED',
          }),
        })
      );
    });
  });

  describe('apply', () => {
    const succeededImport = {
      uid: 'import-1',
      status: MemberCvImportStatus.SUCCEEDED,
      payload: {},
    };

    const applyBody = {
      importUid: 'import-1',
      role: 'Engineer',
      location: 'Berlin, Germany',
      skills: ['Rust', 'Go'],
      experiences: [
        {
          title: 'Engineer',
          company: 'Lattice',
          description: '<p>Work</p>',
          startDate: '2021-03',
          endDate: null,
          isCurrent: true,
          location: 'Berlin',
        },
      ],
    };

    beforeEach(() => {
      cvFindUnique.mockResolvedValue(succeededImport);
      memberFindUnique.mockImplementation((args: { select?: Record<string, unknown> }) => {
        const select = args?.select ?? {};
        if (Object.keys(select).length === 1 && select.role) {
          return Promise.resolve({ role: 'Engineer' });
        }
        return Promise.resolve({
          uid: 'member-1',
          role: null,
          locationUid: null,
          customSkills: [],
          skills: [{ uid: 'skill-go', title: 'Go' }],
        });
      });
      skillFindFirst.mockImplementation(({ where }: { where: { title: { equals: string } } }) => {
        if (where.title.equals.toLowerCase() === 'go') {
          return Promise.resolve({ uid: 'skill-go', title: 'Go' });
        }
        if (where.title.equals.toLowerCase() === 'rust') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      skillCreate.mockResolvedValue({ uid: 'skill-rust', title: 'Rust' });
      (locationTransferService.fetchLocation as jest.Mock).mockResolvedValue({
        status: 'OK',
        location: {
          placeId: 'place-berlin',
          city: 'Berlin',
          country: 'Germany',
          continent: 'Not Defined',
          region: null,
          metroArea: null,
          regionAbbreviation: null,
          latitude: 52.5,
          longitude: 13.4,
        },
      });
      locationUpsert.mockResolvedValue({ uid: 'loc-berlin' });
      memberUpdate.mockResolvedValue({});
      experienceCreate.mockResolvedValue({});
    });

    it('fills blank role and location, unions skills, and appends experience', async () => {
      const result = await service.apply('member-1', applyBody, 'owner@example.com');

      expect(memberUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'Engineer',
            location: { connect: { uid: 'loc-berlin' } },
            customSkills: { set: ['Rust'] },
          }),
        })
      );
      expect(skillCreate).not.toHaveBeenCalled();
      expect(experienceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Engineer',
            company: 'Lattice',
            isCurrent: true,
            endDate: null,
            member: { connect: { uid: 'member-1' } },
          }),
        })
      );
      expect(result).toEqual({
        uid: 'member-1',
        role: 'Engineer',
        locationApplied: true,
        skillsAdded: ['Rust'],
        experiencesAdded: 1,
      });
      expect(cacheService.reset).toHaveBeenCalledWith({ service: 'members' });
    });

    it('does not overwrite an existing role or location', async () => {
      memberFindUnique.mockResolvedValue({
        uid: 'member-1',
        role: 'Founder',
        locationUid: 'loc-existing',
        customSkills: [],
        skills: [],
      });
      skillFindFirst.mockResolvedValue(null);

      await service.apply('member-1', applyBody, 'owner@example.com');

      const data = memberUpdate.mock.calls[0][0].data;
      expect(data.role).toBeUndefined();
      expect(data.location).toBeUndefined();
      expect(locationTransferService.fetchLocation).not.toHaveBeenCalled();
    });

    it('rejects a stale importUid', async () => {
      await expect(
        service.apply('member-1', { ...applyBody, importUid: 'old-import' }, 'owner@example.com')
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('skips experiences that are missing a start date', async () => {
      const result = await service.apply(
        'member-1',
        {
          ...applyBody,
          experiences: [{ ...applyBody.experiences[0], startDate: '' }],
        },
        'owner@example.com'
      );

      expect(experienceCreate).not.toHaveBeenCalled();
      expect(result.experiencesAdded).toBe(0);
    });

    it('applies when optional fields are omitted or null', async () => {
      const result = await service.apply(
        'member-1',
        { importUid: 'import-1', location: null, skills: null, experiences: null },
        'owner@example.com'
      );

      expect(result).toEqual(
        expect.objectContaining({
          uid: 'member-1',
          locationApplied: false,
          skillsAdded: [],
          experiencesAdded: 0,
        })
      );
    });

    it('accepts null location and description after empty-string-to-null', async () => {
      await expect(
        service.apply(
          'member-1',
          {
            ...applyBody,
            location: null,
            experiences: [{ ...applyBody.experiences[0], location: null, description: null }],
          },
          'owner@example.com'
        )
      ).resolves.toEqual(
        expect.objectContaining({
          uid: 'member-1',
          experiencesAdded: 1,
        })
      );
      expect(experienceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            location: null,
            description: null,
          }),
        })
      );
    });
  });

  describe('getLatest', () => {
    it('404s when the member has never uploaded', async () => {
      cvFindUnique.mockResolvedValue(null);
      await expect(service.getLatest('member-1', 'owner@example.com')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('includes a signed file URL when a CV exists', async () => {
      const uploadedAt = new Date('2026-09-01T10:00:00.000Z');
      cvFindUnique.mockResolvedValue({
        uid: 'import-1',
        status: MemberCvImportStatus.SUCCEEDED,
        originalFilename: 'cv.pdf',
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/import-1.pdf',
        fileSizeBytes: 1024,
        uploadedAt,
        payload: { role: 'Engineer' },
      });

      const result = await service.getLatest('member-1', 'owner@example.com');

      expect(result.file).toEqual({
        fileName: 'cv.pdf',
        size: 1024,
        uploadedAt: uploadedAt.toISOString(),
        url: 'https://signed.example/cv.pdf',
      });
      expect(awsService.getSignedGetUrl).toHaveBeenCalledWith('test-uploads', 'cvs/import-1.pdf', 3600, {
        disposition: 'inline',
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      });
    });

    it('forbids a member who is neither the owner nor an admin', async () => {
      (membersService.findMemberByEmail as jest.Mock).mockResolvedValue(TEAM_LEAD);

      await expect(service.getLatest('member-1', 'lead@example.com')).rejects.toBeInstanceOf(ForbiddenException);
      expect(jobApplicationFindFirst).toHaveBeenCalledWith({
        where: { memberUid: 'member-1', jobOpening: { teamUid: { in: ['team-1'] } } },
        select: { uid: true },
      });
    });

    it('allows a team lead when the member applied to one of their team openings', async () => {
      (membersService.findMemberByEmail as jest.Mock).mockResolvedValue(TEAM_LEAD);
      jobApplicationFindFirst.mockResolvedValue({ uid: 'application-1' });
      cvFindUnique.mockResolvedValue({
        uid: 'import-1',
        status: MemberCvImportStatus.SUCCEEDED,
        originalFilename: 'cv.pdf',
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/import-1.pdf',
        fileSizeBytes: 1024,
        uploadedAt: new Date('2026-09-01T10:00:00.000Z'),
        payload: { role: 'Engineer' },
      });

      const result = await service.getLatest('member-1', 'lead@example.com');

      expect(result.file?.url).toBe('https://signed.example/cv.pdf');
    });

    it('omits the file when uploadedAt is missing', async () => {
      cvFindUnique.mockResolvedValue({
        uid: 'import-1',
        status: MemberCvImportStatus.SUCCEEDED,
        originalFilename: 'cv.pdf',
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/import-1.pdf',
        fileSizeBytes: 1024,
        uploadedAt: null,
        payload: { role: 'Engineer' },
      });

      const result = await service.getLatest('member-1', 'owner@example.com');

      expect(result.file).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('deletes the S3 object and the row', async () => {
      cvFindUnique.mockResolvedValue({
        uid: 'import-1',
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/import-1.pdf',
      });
      cvDelete.mockResolvedValue({});

      await service.remove('member-1', 'owner@example.com');

      expect(cvDelete).toHaveBeenCalledWith({ where: { memberUid: 'member-1' } });
      expect(awsService.deleteObjectFromS3).toHaveBeenCalledWith('test-uploads', 'cvs/import-1.pdf');
    });

    it('does not clear member profile fields', async () => {
      cvFindUnique.mockResolvedValue({
        uid: 'import-1',
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/import-1.pdf',
      });
      cvDelete.mockResolvedValue({});

      await service.remove('member-1', 'owner@example.com');

      expect(memberUpdate).not.toHaveBeenCalled();
      expect(experienceCreate).not.toHaveBeenCalled();
    });

    it('404s when the member has no CV', async () => {
      cvFindUnique.mockResolvedValue(null);
      await expect(service.remove('member-1', 'owner@example.com')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getCurrentCv', () => {
    it('returns the stored file metadata', async () => {
      const uploadedAt = new Date('2026-09-01T10:00:00.000Z');
      cvFindUnique.mockResolvedValue({
        originalFilename: 'cv.pdf',
        fileSizeBytes: 2048,
        uploadedAt,
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/import-1.pdf',
      });

      const result = await service.getCurrentCv('member-1');

      expect(result).toEqual({
        fileName: 'cv.pdf',
        size: 2048,
        uploadedAt: uploadedAt.toISOString(),
        s3Bucket: 'test-uploads',
        s3Key: 'cvs/import-1.pdf',
      });
    });

    it('returns null when there is no CV', async () => {
      cvFindUnique.mockResolvedValue(null);
      await expect(service.getCurrentCv('member-1')).resolves.toBeNull();
    });
  });
});
