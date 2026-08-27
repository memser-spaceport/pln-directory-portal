import { BadRequestException } from '@nestjs/common';
import { CV_IMPORT_MAX_BYTES, CV_IMPORT_PDF_MIME_TYPES } from './member-cv-imports.constants';

export function assertPdfFile(file: { buffer?: Buffer; mimetype?: string; size?: number; originalname?: string }) {
  if (!file?.buffer?.length) {
    throw new BadRequestException('File is required');
  }
  if ((file.size ?? file.buffer.length) > CV_IMPORT_MAX_BYTES) {
    throw new BadRequestException('PDF must be 5MB or smaller');
  }
  const mime = (file.mimetype || '').toLowerCase();
  if (mime && !CV_IMPORT_PDF_MIME_TYPES.includes(mime)) {
    throw new BadRequestException('Only PDF files are accepted');
  }
  if (file.buffer.toString('ascii', 0, 4) !== '%PDF') {
    throw new BadRequestException('Only PDF files are accepted');
  }
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse's package entry runs a self-test when loaded as main.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text?: string }>;
  const result = await pdfParse(buffer);
  return (result?.text ?? '').trim();
}
