export type LogoVerificationConfidence = 'high' | 'medium' | 'low';
export type LogoQuality = 'good' | 'poor' | 'unusable';
export type LogoVerificationVerdict =
  | 'verified'
  | 'weak_match'
  | 'mismatch'
  | 'unverifiable';

export type LogoVerificationSource =
  | 'website'
  | 'scrapingdog'
  | 'manual'
  | 'unknown';

export interface LogoVerificationInput {
  teamName: string;
  website?: string | null;
  logoUrl: string;
  source?: LogoVerificationSource;
}

export interface LogoVerificationResult {
  predictedCompanyName: string | null;
  verdict: LogoVerificationVerdict;
  confidence: LogoVerificationConfidence;
  quality: LogoQuality;
  hasReadableText: boolean;
  reason: string;
  brandSignals: string[];
}

export interface VerifyLogoRequestDto {
  teamName: string;
  website?: string | null;
  logoUrl: string;
  source?: LogoVerificationSource;
  expected?: string;
}

export interface VerifyLogoBatchRequestDto {
  mode?: 'all' | 'gemini' | 'openai' | 'anthropic';
  items: VerifyLogoRequestDto[];
}

export interface LogoVerificationDatasetRow {
  teamName: string;
  website?: string | null;
  logoUrl: string;
  source?: LogoVerificationSource;
  expected?: string;
}

export interface LogoVerificationAllProvidersResponse {
  providers: Partial<Record<'gemini' | 'openai' | 'anthropic', LogoVerificationResult>>;
  decision: 'accept' | 'reject' | 'review';
}

export interface LogoVerificationBatchItemResponse {
  input: LogoVerificationInput;
  expected: string | null;
  result: LogoVerificationResult | LogoVerificationAllProvidersResponse;
}

export interface LogoVerificationBatchResponse {
  total: number;
  mode: 'all' | 'gemini' | 'openai' | 'anthropic';
  results: LogoVerificationBatchItemResponse[];
}
