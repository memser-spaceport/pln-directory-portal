export enum APP_ENV {
  DEV = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

export const ALLOWED_CORS_ORIGINS = {
  [APP_ENV.DEV]: [
    /localhost/,
    /app.forestadmin.com/,
    /.-protocol-labs-spaceport.vercel.app/,
    /protocol-labs-network-lk82taf1j-protocol-labs-spaceport.vercel.app/,
    /protocol-labs-network-web-admin.vercel.app/,
    /dev.plnetwork.io/,
    /dev-admin.plnetwork.io/,
    /staging.plnetwork.io/,
    /dev-auth-admin.plnetwork.io/,
    /dev-auth-app.plnetwork.io/,
    /dev-analytics.plnetwork.io/,
    /staging-admin.plnetwork.io/,
  ],
  [APP_ENV.STAGING]: [
    /.-protocol-labs-spaceport.vercel.app/,
    /app.forestadmin.com/,
    /staging.plnetwork.io/,
    /dev-auth-admin.plnetwork.io/,
    /dev-auth-app.plnetwork.io/,
    /dev-analytics.plnetwork.io/,
    /staging-admin.plnetwork.io/,
  ],
  [APP_ENV.PRODUCTION]: [
    'https://www.plnetwork.io',
    /app.forestadmin.com/,
    /admin.plnetwork.io/,
    /plnetwork.io/,
  ],
};

export const IS_DEV_ENVIRONMENT = process.env.ENVIRONMENT == APP_ENV.DEV;

export const NOT_FOUND_GLOBAL_ERROR_RESPONSE = {
  statusCode: 404,
  error: 'Not Found',
};

export const NOT_FOUND_GLOBAL_RESPONSE_SCHEMA = {
  schema: {
    type: 'object',
    example: NOT_FOUND_GLOBAL_ERROR_RESPONSE,
  },
};

export const THUMBNAIL_SIZES = {
  LARGE: 1500,
  MEDIUM: 512,
  SMALL: 256,
  TINY: 78,
};

export const FILE_UPLOAD_SIZE_LIMIT = 1000000; // 1MB in bytes

export const IMAGE_UPLOAD_MAX_DIMENSION = 2000;

export const DIRECTORYADMIN = 'DIRECTORYADMIN';

export const JOIN_NOW_SUBJECT = 'A request to be a part of network';

export const ASK_QUESTION = "Ask a Question";
export const FEEDBACK = "Give Feedback";
export const SHARE_IDEA = "Share an Idea";
export const SUPPORT = "Get Support";

export const ASK_QUESTION_SUBJECT = "A new query received";
export const FEEDBACK_SUBJECT = "A new feedback received";
export const SHARE_IDEA_SUBJECT = "A new idea received";
export const SUPPORT_SUBJECT = "A new support request received";
export const IPFS = 'ipfs';
export const S3 = 's3';

export const DEFAULT_MEMBER_ROLES = {
  Founder: {
    role: 'Founder',
    alias: 'Founder/Co-Founder',
    default: true
  },
  CEO: {
    role: 'CEO',
    default: true
  },
  CTO: {
    role: 'CTO',
    default: true
  },
  COO: {
    role: 'COO',
    default: true
  }
};

export const PROJECT = 'Project';
export const TEAM = 'Team';

export const InteractionFailureReasons: { [key: string]: string } = {
  "Broken Link": "IFR0001",
  "I plan to schedule soon": "IFR0002",
  "Preferred slot not available": "IFR0003",
  "Meeting yet to happen": "IFR0004",
  "Got Rescheduled": "IFR0005",
  "Got Cancelled" : "IFR0006",
  "Member didn’t show up": "IFR0007",
  "I did not show up":"IFR0008",
  "Other": "IFR0009"
};
