export enum APP_ENV {
  DEV = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

export const ALLOWED_CORS_ORIGINS = {
  [APP_ENV.DEV]: /localhost/,
  [APP_ENV.STAGING]: /.-protocol-labs-spaceport.vercel.app/,
  [APP_ENV.PRODUCTION]: 'https://www.plnetwork.io',
};

export const IS_DEV_ENVIRONMENT = process.env.ENVIRONMENT == APP_ENV.DEV;
