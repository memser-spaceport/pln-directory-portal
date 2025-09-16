import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { UploadKind, UploadScopeType, UploadStorage } from '@prisma/client';
import * as crypto from 'crypto';
import {AwsService} from "../utils/aws/aws.service";
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
    private readonly aws: AwsService,
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

  // Builds the persistent app URL (does not expire).
  private buildAppUrl(uid: string, mode: Disposition = 'inline') {
    const base = process.env.APP_BASE_URL?.replace(/\/+$/, '') || '';
    return `${base}/v1/uploads/u/${uid}/${mode}`;
  }

  // Creates Upload row. Stores a persistent app URL in DB (not a pre-signed S3 URL).
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

    // Store and get a secure URL
    const { storage, keyOrPath, bucket: usedBucket } = await this.files.storeOneAndGetSecureUrl(file, {
      prefix: `uploads/${(params.scopeType || 'NONE').toLowerCase()}/${params.scopeUid ?? 'none'}/${kind.toLowerCase()}`,
      signed: true,
    });

    // Map storage string to enum
    const storageEnum: UploadStorage = storage === 'ipfs' ? 'IPFS' : 'S3';

    const created = await this.prisma.upload.create({
      data: {
        storage: storageEnum,
        kind,
        status: 'READY',
        scopeType: params.scopeType ?? 'NONE',
        scopeUid: params.scopeUid ?? null,
        uploaderUid: params.uploaderUid ?? null,
        bucket: storageEnum === 'S3' ? usedBucket : null,
        key: storageEnum === 'S3' ? keyOrPath : null,
        cid: storageEnum === 'IPFS' ? keyOrPath : null,
        url: '', // will be replaced with persistent app URL below
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        checksum,
      },
    });

    const appUrl = this.buildAppUrl(created.uid, 'inline');
    const row = await this.prisma.upload.update({
      where: { uid: created.uid },
      data: { url: appUrl },
    });

    return row;
  }

  // Fetches full Upload row and attaches a fresh (short-lived) direct URL for clients that need it.
  async getOneWithFreshUrl(uid: string, options?: { disposition?: Disposition; ttlSec?: number }) {
    const row = await this.prisma.upload.findUnique({ where: { uid } });
    if (!row) throw new BadRequestException('Upload not found');
    const MIN_TTL = 30;
    const DEFAULT_TTL = Number(process.env.SIGNED_URL_TTL_SEC ?? 86400);      // 1 day by default
    const HARD_CAP  = 604800;                                                 // 7 days (SigV4 hard cap)
    const MAX_TTL = Math.min(Number(process.env.SIGNED_URL_MAX_TTL_SEC ?? HARD_CAP), HARD_CAP);
    // 1 day by default
    const disposition: Disposition = options?.disposition ?? 'inline';
    const ttlSec = Math.min(
      Math.max(Number(options?.ttlSec ?? DEFAULT_TTL), MIN_TTL),
      MAX_TTL,
    );
    let freshUrl: string | null = null;
    let expiresIn: number | null = null;

    if (row.storage === 'S3' && row.bucket && row.key) {
      freshUrl = await this.aws.getSignedGetUrl(row.bucket, row.key, ttlSec, {
        disposition,
        filename: row.filename,
        contentType: row.mimetype,
      });
      expiresIn = ttlSec;
    } else if (row.storage === 'IPFS' && row.cid) {
      const worker = (process.env.WORKER_IMAGE_URL || '').replace(/\/+$/, '');
      freshUrl = `${worker}/${row.cid}/${encodeURIComponent(row.filename)}`;
      expiresIn = null;
    }

    return { ...row, freshUrl, expiresIn };
  }
}
