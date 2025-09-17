import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { UploadKind, UploadScopeType, UploadStorage } from '@prisma/client';
import * as crypto from 'crypto';
import cuid from "cuid";

const SLIDE_MIMES = new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const VIDEO_MIMES = new Set(['video/mp4','video/webm','video/quicktime']);
const IMAGE_MIMES = new Set(['image/jpeg','image/png','image/webp']);

const LIMITS = {
  IMAGE: 25 * 1024 * 1024,  // 25MB
  SLIDE: 25 * 1024 * 1024,  // 25MB
  VIDEO: 500 * 1024 * 1024, // 500MB
  OTHER: 50 * 1024 * 1024,
};

function checksumSha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

type Disposition = 'inline' | 'attachment';

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileUploadService,
  ) {}

  // Basic mime validation by kind
  private validateMimeByKind(kind: UploadKind, mime: string) {
    if (kind === 'SLIDE' && !SLIDE_MIMES.has(mime)) {
      throw new BadRequestException('Invalid slide type. Allowed: pdf, jpg, png, webp');
    }
    if (kind === 'VIDEO' && !VIDEO_MIMES.has(mime)) {
      throw new BadRequestException('Invalid video type. Allowed: mp4, webm, mov');
    }
    if (kind === 'IMAGE' && !IMAGE_MIMES.has(mime)) {
      throw new BadRequestException('Invalid image type. Allowed: jpg, png, webp');
    }
    // OTHER — any type
  }

  private validateSize(kind: UploadKind, size: number) {
    const max = LIMITS[kind] ?? LIMITS.OTHER;
    if (size > max) {
      throw new BadRequestException(`File too large. Max for ${kind} is ${Math.round(max/1024/1024)}MB`);
    }
  }

  // Builds public S3 URL (assuming bucket is public)
  private buildS3Url(bucket: string, key: string): string {
    const domain = process.env.AWS_S3_DOMAIN ?? `s3.${process.env.AWS_REGION}.amazonaws.com`;
    return `https://${bucket}.${domain}/${key}`;
  }

  // Builds the persistent app URL (does not expire).
  private buildAppUrl(uid: string, mode: Disposition = 'inline') {
    const base = process.env.APP_BASE_URL?.replace(/\/+$/, '') || '';
    return `${base}/v1/uploads/u/${uid}/${mode}`;
  }

  // Creates Upload row and stores a persistent app URL in DB (no pre-signed URLs needed for public bucket).
  async uploadGeneric(params: {
    file: Express.Multer.File;
    kind: UploadKind;
    scopeType?: UploadScopeType;
    scopeUid?: string | null;
    uploaderUid?: string | null;
  }) {
    const { file, kind } = params;
    if (!file) throw new BadRequestException('file is required');
    this.validateMimeByKind(kind, file.mimetype);
    this.validateSize(kind, file.size);

    const checksum = checksumSha256(file.buffer);

    // Store file; since bucket is public, no signing is required.
    const { storage, keyOrPath, bucket: usedBucket } = await this.files.storeOneAndGetSecureUrl(file, {
      prefix: `uploads/${(params.scopeType || 'NONE').toLowerCase()}/${params.scopeUid ?? 'none'}/${kind.toLowerCase()}`,
      signed: true,
    });

    // Map storage string to enum
    const storageEnum: UploadStorage = storage === 'ipfs' ? 'IPFS' : 'S3';

    // Pre-generate uid so we can build the app URL before DB write
    const uid = cuid();

    // Non-expiring app URL
    const s3Url =
      storageEnum === 'S3' && usedBucket && keyOrPath
        ? this.buildS3Url(usedBucket, keyOrPath)
        : this.buildAppUrl(uid);

    const created = await this.prisma.upload.create({
      data: {
        uid,
        storage: storageEnum,
        kind,
        status: 'READY',
        scopeType: params.scopeType ?? 'NONE',
        scopeUid: params.scopeUid ?? null,
        uploaderUid: params.uploaderUid ?? null,
        bucket: storageEnum === 'S3' ? (usedBucket ?? null) : null,
        key:    storageEnum === 'S3' ? (keyOrPath ?? null) : null,
        cid:    storageEnum === 'IPFS' ? (keyOrPath ?? null) : null,
        url: s3Url,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        checksum,
      },
    });

    return created;
  }


  // Returns an Upload row from DB as-is (no fresh-link generation).
  async getOne(uid: string) {
    const row = await this.prisma.upload.findUnique({ where: { uid } });
    if (!row) throw new BadRequestException('Upload not found');
    return row;
  }
}
