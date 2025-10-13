import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { AwsService } from '../utils/aws/aws.service';
import { UploadKind, UploadScopeType, UploadStatus, UploadStorage } from '@prisma/client';
import * as crypto from 'crypto';
import cuid from 'cuid';
import sharp from "sharp";

const SLIDE_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
import { fromBuffer } from "pdf2pic";

const LIMITS = {
  IMAGE: 25 * 1024 * 1024, // 25MB
  SLIDE: 25 * 1024 * 1024, // 25MB
  VIDEO: 500 * 1024 * 1024, // 500MB
  OTHER: 50 * 1024 * 1024,
};

function checksumSha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

type Disposition = 'inline' | 'attachment';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileUploadService,
    private readonly awsService: AwsService
  ) {}

  // Basic MIME validation by kind
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
      throw new BadRequestException(`File too large. Max for ${kind} is ${Math.round(max / 1024 / 1024)}MB`);
    }
  }

  // Builds public S3 URL (assuming bucket is public)
  private buildS3Url(bucket: string, key: string): string {
    const domain = process.env.AWS_S3_DOMAIN ?? `s3.${process.env.AWS_REGION}.amazonaws.com`;
    return `https://${bucket}.${domain}/${key}`;
  }

  // Build the persistent app URL (does not expire)
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
    const {
      storage,
      keyOrPath,
      bucket: usedBucket,
    } = await this.files.storeOneAndGetSecureUrl(file, {
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

    // Generate preview for PDFs (first page)
    let previewUrl: string | null = null;
    if (kind === 'SLIDE' && file.mimetype === 'application/pdf' && usedBucket && keyOrPath) {
      previewUrl = await this.generateAndStorePdfPreview(file, {
        scopeType: params.scopeType ?? 'NONE',
        scopeUid: params.scopeUid ?? null,
        kind: 'IMAGE',
      });
    }

    const created = await this.prisma.upload.create({
      data: {
        uid,
        storage: storageEnum,
        kind,
        status: 'READY',
        scopeType: params.scopeType ?? 'NONE',
        scopeUid: params.scopeUid ?? null,
        uploaderUid: params.uploaderUid ?? null,
        bucket: storageEnum === 'S3' ? usedBucket ?? null : null,
        key: storageEnum === 'S3' ? keyOrPath ?? null : null,
        cid: storageEnum === 'IPFS' ? keyOrPath ?? null : null,
        url: s3Url,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        checksum,
        previewImageUrl: previewUrl,
      },
    });

    return created;
  }

  // Returns an Upload row from DB as-is
  async getOne(uid: string) {
    const row = await this.prisma.upload.findUnique({ where: { uid } });
    if (!row) throw new BadRequestException('Upload not found');
    return row;
  }

  async createPendingUpload(params: {
    kind: UploadKind;
    scopeType?: UploadScopeType;
    scopeUid?: string | null;
    uploaderUid?: string | null;
    filename: string;
    mimetype: string;
    size: number;
    bucket?: string;
    key?: string;
  }) {
    const uid = cuid();

    const created = await this.prisma.upload.create({
      data: {
        uid,
        storage: 'S3',
        kind: params.kind,
        status: UploadStatus.PROCESSING,
        scopeType: params.scopeType ?? 'NONE',
        scopeUid: params.scopeUid ?? null,
        uploaderUid: params.uploaderUid ?? null,
        bucket: params.bucket ?? null,
        key: params.key ?? null,
        cid: null,
        url: '', // Will be set when confirmed
        filename: params.filename,
        mimetype: params.mimetype,
        size: params.size,
        checksum: '', // Will be set when confirmed
      },
    });

    return created;
  }

  async confirmUpload(uid: string, actualSize?: number) {
    const upload = await this.prisma.upload.findUnique({
      where: { uid },
    });

    if (!upload) {
      throw new BadRequestException('Upload not found');
    }

    if (upload.status !== UploadStatus.PROCESSING) {
      throw new BadRequestException('Upload is not in PENDING status');
    }

    if (!upload.bucket || !upload.key) {
      throw new BadRequestException('Upload missing S3 bucket or key');
    }

    const exists = await this.awsService.checkObjectExists(upload.bucket, upload.key);
    if (!exists) {
      throw new BadRequestException('S3 object not found');
    }

    const s3Url = this.buildS3Url(upload.bucket, upload.key);

    const updated = await this.prisma.upload.update({
      where: { uid },
      data: {
        status: 'READY',
        url: s3Url,
        size: actualSize ?? upload.size,
      },
    });

    return updated;
  }

  private async generateAndStorePdfPreview(
    file: Express.Multer.File,
    opts: { scopeType: UploadScopeType; scopeUid: string | null; kind: UploadKind }
  ): Promise<string | null> {
    // Guard: accept PDFs only (octet-stream tolerated)
    if (!file || !file.buffer || !/pdf$/i.test(file.mimetype || "")) return null;

    const TARGET_W = 1920;
    const TARGET_H = 1080;

    try {
      this.logger.log(`PDF preview: rendering via pdf2pic (filename="${file.originalname}")`);

      // 1) Render first page at a solid DPI (not too big to avoid over-zoom after contain)
      const renderOpts = {
        density: 144,          // good sharpness; bump to 200 if tiny text
        format: "png" as const,
        width: 1920,           // render roughly to the target width
        quality: 90,
      };
      const convert = fromBuffer(file.buffer, renderOpts);
      const result = await convert(1, { responseType: "base64" });

      if (!result?.base64) {
        this.logger.warn("PDF preview: pdf2pic returned empty base64 data");
        return null;
      }

      const pageBuf = Buffer.from(result.base64, "base64");

      // 2) Fit the entire page into 1920×1080 WITHOUT cropping or stretching.
      //    'contain' preserves aspect ratio and adds borders when needed.
      const previewBuf = await sharp(pageBuf)
        .resize(TARGET_W, TARGET_H, {
          fit: "contain",
          position: "center",
          background: { r: 255, g: 255, b: 255, alpha: 1 }, // white letterbox
          withoutEnlargement: true, // don't blow up small pages (keeps text from looking oversized)
        })
        .png({ quality: 90 })
        .toBuffer();

      // 3) Prepare file for storage
      const previewFile: Express.Multer.File = {
        ...file,
        buffer: previewBuf,
        size: previewBuf.length,
        mimetype: "image/png",
        originalname: `${file.originalname.replace(/\.[^.]+$/i, "")}.png`,
        fieldname: file.fieldname,
        encoding: file.encoding,
        destination: (file as any).destination ?? "",
        filename: (file as any).filename ?? "",
        path: (file as any).path ?? "",
        stream: (file as any).stream,
      };

      // 4) Store and return URL
      const stored = await this.files.storeOneAndGetSecureUrl(previewFile, {
        prefix: `previews/${(opts.scopeType || "NONE").toLowerCase()}/${opts.scopeUid ?? "none"}/${opts.kind.toLowerCase()}`,
        signed: true,
      });

      const url =
        stored?.bucket && stored?.keyOrPath
          ? this.buildS3Url(stored.bucket, stored.keyOrPath)
          : null;

      if (!url) this.logger.warn("PDF preview: S3 URL is empty after store");

      this.logger.log(`PDF preview successfully created: ${url}`);
      return url;
    } catch (err) {
      this.logger.error(
        `PDF preview failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }
}
