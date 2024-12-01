/* eslint-disable prettier/prettier */
import {
    BadRequestException,
    CACHE_MANAGER,
    ForbiddenException,
    Inject,
    Injectable,
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { Cache } from 'cache-manager';
import { LogService } from '../shared/log.service';

@Injectable()
export class EmailOtpService {
    constructor(
        @Inject(CACHE_MANAGER) private cacheService: Cache,
        private logger: LogService
        ) { }

    async sendEmailOtp(email) {
        console.log('111111111111111111111111111111111111--------------------------', email);
        const clientToken = await this.getAuthClientToken();
        const payload = { recipientAddress: email.toLowerCase().trim(), notificationType: 'EMAIL', }
        const header = { headers: { Authorization: `Bearer ${clientToken}` } }
        let otpResult;
        try {
            otpResult = await this.getAuthApi().post(`${process.env.AUTH_API_URL}/mfa/otp`, payload, header);
        } catch (error) {
            this.handleAuthErrors(error)
        }
        console.log('111111111111111111111111111111111111', otpResult);

        this.logger.info(`Successfully sent email otp for emailid - ${email}`)
        return otpResult.data;
    }

    async resendEmailOtp(otpToken) {
        const clientToken = await this.getAuthClientToken();
        const payload = { token: otpToken }
        const header = { headers: { Authorization: `Bearer ${clientToken}` } }
        let sendOtpResult;
        try {
            sendOtpResult = await this.getAuthApi().post(`/mfa/otp/resend`, payload, header);
        } catch (error) {
            this.handleAuthErrors(error)
        }

        this.logger.info(`Successfully resent email otp for otptoken - ${otpToken}`)
        return sendOtpResult.data;
    }

    async verifyEmailOtp(otp, otpToken) {
        const clientToken = await this.getAuthClientToken();
        const payload = { code: otp, token: otpToken, }
        const header = { headers: { Authorization: `Bearer ${clientToken}` } }
        let verifyOtpResult
        try {
            verifyOtpResult = await this.getAuthApi().post(`/mfa/otp/verify`, payload, header)
        } catch (error) {
            this.handleAuthErrors(error)
        }

        this.logger.info(`Successfully validated email otp for otptoken - ${otpToken}`)
        return verifyOtpResult?.data
    }



    /*************************************** PRIVATE METHODS *************************/
    private async getAuthClientToken() {
        const tokenFromMemory = await this.cacheService.store.get("authserviceClientToken");
        if (tokenFromMemory) {
            return tokenFromMemory
        }
        const newClientToken = await this.getClientToken();
        await this.cacheService.store.set("authserviceClientToken", newClientToken, {ttl: 3600});
        return newClientToken;
    }

    private async getClientToken() {
        let response;
        try {
            response = await axios.post(`${process.env.AUTH_API_URL}/auth/token`, {
                "client_id": process.env.AUTH_APP_CLIENT_ID,
                "client_secret": process.env.AUTH_APP_CLIENT_SECRET,
                "grant_type": "client_credentials",
                "grantTypes": ["client_credentials", "authorization_code", "refresh_token"]
            })
        } catch(error) {
            this.handleAuthErrors(error)
        }

        return response.data.access_token;
    }

    private getAuthApi() {
        const authOtpService = axios.create({
            baseURL: `${process.env.AUTH_API_URL}`
        })
        authOtpService.interceptors.response.use(
            (response) => response,
            (error) => {
                const originalRequest = error.config;
                if (error.response.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;
                    return this.getClientToken().then((accessToken) => {
                        this.cacheService.store.set("authserviceClientToken", accessToken, {ttl: 3600});
                        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                        return axios(originalRequest);
                    });
                }
                return Promise.reject(error);
            }
        );

        return authOtpService;

    }

    private handleAuthErrors(error) {
        if (error?.response?.status === 401) {
            throw new UnauthorizedException("Unauthorized")
        } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP005') {
            throw new UnauthorizedException("Unauthorized")
        } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP003') {
            throw new ForbiddenException("MAX_OTP_ATTEMPTS_REACHED")
        } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EATH010') {
            throw new ForbiddenException("ACCOUNT_ALREADY_LINKED")
        } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EATH002') {
            throw new ForbiddenException("ACCOUNT_ALREADY_LINKED")
        } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP006') {
            throw new ForbiddenException("MAX_RESEND_ATTEMPTS_REACHED")
        } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP004') {
            throw new BadRequestException("CODE_EXPIRED")
        } else {
            throw new InternalServerErrorException("Unexpected error. Please try again", { cause: error })
        }
    }

}
