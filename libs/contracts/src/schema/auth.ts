import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

const SendOtpRequestSchema = z.object({
    email: z.string(),
})

const ResendOtpRequestSchema = z.object({
    otpToken: z.string(),
})

const VerifyOtpRequestSchema = z.object({
    otp: z.string(),
    otpToken: z.string(),
    idToken: z.string()
})

const GRANT_TYPES = ["refresh_token", "authorization_code", "token_exchange"] as const;
const TokenRequestSchema = z.object({
    grantType: z.enum(GRANT_TYPES),
    code: z.string().optional(),
    refreshToken: z.string().optional(),
    exchangeRequestToken: z.string().optional(),
    exchangeRequestId: z.string().optional()
}).superRefine((data, ctx) => {
    if (data.grantType === 'refresh_token' && !data.refreshToken) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Refresh token required for this grant type',
            fatal: true,
        });
        return z.never;
    }
    if (data.grantType === 'authorization_code' && !data.code) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Code required for this grant type',
            fatal: true,
        });
        return z.never;
    }
    if (data.grantType === 'token_exchange' && (!data.exchangeRequestToken || !data.exchangeRequestId)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Request token and id required for this grant type',
            fatal: true,
        });
        return z.never;
    }
});

export class SendOtpRequestDto extends createZodDto(SendOtpRequestSchema) { }
export class ResendOtpRequestDto extends createZodDto(ResendOtpRequestSchema) { }
export class VerifyOtpRequestDto extends createZodDto(VerifyOtpRequestSchema) { }
export class TokenRequestDto extends createZodDto(TokenRequestSchema) { }