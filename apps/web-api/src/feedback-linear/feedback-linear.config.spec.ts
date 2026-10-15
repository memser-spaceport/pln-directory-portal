import {
  FEEDBACK_LINEAR_DEFAULT_MAX_ATTEMPTS,
  feedbackLinearImageHosts,
  feedbackLinearMaxAttempts,
  getFeedbackLinearConfig,
  isFeedbackLinearConfigured,
} from './feedback-linear.config';

const KEYS = [
  'FEEDBACK_LINEAR_CLIENT_ID',
  'FEEDBACK_LINEAR_CLIENT_SECRET',
  'FEEDBACK_LINEAR_PLATFORM_TEAM_ID',
  'FEEDBACK_LINEAR_PLATFORM_STATE_ID',
  'FEEDBACK_LINEAR_AI_APPS_PROJECT_ID',
  'FEEDBACK_LINEAR_LABEL_ID',
  'FEEDBACK_LINEAR_IMAGE_HOSTS',
  'FEEDBACK_LINEAR_MAX_ATTEMPTS',
  'AWS_S3_IMAGE_BUCKET_NAME',
  'AWS_REGION',
  'AWS_S3_DOMAIN',
  'WORKER_IMAGE_URL',
];

describe('feedback-linear config', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function configureRequired() {
    process.env.FEEDBACK_LINEAR_CLIENT_ID = 'cid';
    process.env.FEEDBACK_LINEAR_CLIENT_SECRET = 'secret';
    process.env.FEEDBACK_LINEAR_PLATFORM_TEAM_ID = 'team';
    process.env.FEEDBACK_LINEAR_PLATFORM_STATE_ID = 'state';
  }

  it('is not configured with no env vars', () => {
    expect(getFeedbackLinearConfig()).toBeNull();
    expect(isFeedbackLinearConfigured()).toBe(false);
  });

  it.each(KEYS.slice(0, 4))('is not configured when %s is missing', (missing) => {
    configureRequired();
    delete process.env[missing];
    expect(isFeedbackLinearConfigured()).toBe(false);
  });

  it('is not configured when a required var is blank', () => {
    configureRequired();
    process.env.FEEDBACK_LINEAR_CLIENT_SECRET = '   ';
    expect(isFeedbackLinearConfigured()).toBe(false);
  });

  it('returns the config with optional fields null by default', () => {
    configureRequired();
    expect(getFeedbackLinearConfig()).toEqual({
      clientId: 'cid',
      clientSecret: 'secret',
      platformTeamId: 'team',
      platformStateId: 'state',
      aiAppsProjectId: null,
      labelId: null,
      imageHosts: [],
      maxAttempts: FEEDBACK_LINEAR_DEFAULT_MAX_ATTEMPTS,
    });
  });

  it('reads the optional project and label', () => {
    configureRequired();
    process.env.FEEDBACK_LINEAR_AI_APPS_PROJECT_ID = 'proj';
    process.env.FEEDBACK_LINEAR_LABEL_ID = 'label';
    expect(getFeedbackLinearConfig()).toMatchObject({ aiAppsProjectId: 'proj', labelId: 'label' });
  });

  describe('image hosts', () => {
    it('defaults to the image bucket location plus S3 domain and IPFS worker hosts', () => {
      process.env.AWS_S3_IMAGE_BUCKET_NAME = 'pl-directory-images-prod';
      process.env.AWS_REGION = 'us-west-1';
      process.env.AWS_S3_DOMAIN = 'cdn.example.com';
      process.env.WORKER_IMAGE_URL = 'https://ipfs-worker.example.com/files';
      expect(feedbackLinearImageHosts()).toEqual([
        'pl-directory-images-prod.s3.us-west-1.amazonaws.com',
        'cdn.example.com',
        'ipfs-worker.example.com',
      ]);
    });

    it('skips the bucket host without a region', () => {
      process.env.AWS_S3_IMAGE_BUCKET_NAME = 'bucket';
      expect(feedbackLinearImageHosts()).toEqual([]);
    });

    it('uses the explicit list, trimmed and lowercased, instead of the defaults', () => {
      process.env.AWS_S3_IMAGE_BUCKET_NAME = 'bucket';
      process.env.AWS_REGION = 'us-west-1';
      process.env.FEEDBACK_LINEAR_IMAGE_HOSTS = ' A.example.com, b.example.com ,,';
      expect(feedbackLinearImageHosts()).toEqual(['a.example.com', 'b.example.com']);
    });
  });

  describe('max attempts', () => {
    it('defaults to 8', () => {
      expect(feedbackLinearMaxAttempts()).toBe(8);
    });

    it('reads a positive integer', () => {
      process.env.FEEDBACK_LINEAR_MAX_ATTEMPTS = '3';
      expect(feedbackLinearMaxAttempts()).toBe(3);
    });

    it.each(['0', '-2', 'abc'])('falls back to the default for %s', (value) => {
      process.env.FEEDBACK_LINEAR_MAX_ATTEMPTS = value;
      expect(feedbackLinearMaxAttempts()).toBe(8);
    });
  });
});
