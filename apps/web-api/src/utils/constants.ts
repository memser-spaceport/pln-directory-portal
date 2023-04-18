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
  ],
  [APP_ENV.STAGING]: [
    /.-protocol-labs-spaceport.vercel.app/,
    /app.forestadmin.com/,
  ],
  [APP_ENV.PRODUCTION]: ['https://www.plnetwork.io', /app.forestadmin.com/],
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
