export const MEMBER_CV_PARSE_AI_PROVIDER_ENV = 'MEMBER_CV_PARSE_AI_PROVIDER';

export const CV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const CV_IMPORT_MAX_TEXT_CHARS = 100_000;
export const CV_IMPORT_S3_PREFIX = 'cvs';

export const CV_IMPORT_PDF_MIME_TYPES = ['application/pdf', 'application/x-pdf'];

export const YEAR_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * How long a CV link stays good.
 *
 * Long enough to open the document, scroll it and change your mind; short
 * enough that a link pasted somewhere else stops working. The profile re-asks
 * whenever it needs one, so nothing is holding these.
 */
export const CV_FILE_URL_TTL_SECONDS = 600;
