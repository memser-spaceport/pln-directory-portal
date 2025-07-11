import {
  BadRequestException,
  CACHE_MANAGER,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import jwt_decode from 'jwt-decode';
import { Cache } from 'cache-manager';
import { MembersService } from '../members/members.service';
import { EmailOtpService } from '../otp/email-otp.service';
import { ModuleRef } from '@nestjs/core';
import { LogService } from '../shared/log.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';

@Injectable()
export class AuthService implements OnModuleInit {
  private membersService: MembersService;
  constructor(
    private moduleRef: ModuleRef,
    private emailOtpService: EmailOtpService,
    private logger: LogService,
    @Inject(CACHE_MANAGER) private cacheService: Cache,
    private analyticsService: AnalyticsService
  ) {}

  onModuleInit() {
    this.membersService = this.moduleRef.get(MembersService, { strict: false });
  }

  async createAuthRequest(authRequest) {
    const output = await axios.post(`${process.env.AUTH_API_URL}/auth`, {
      state: authRequest.state,
      client_id: process.env.AUTH_APP_CLIENT_ID,
    });

    return output.data.uid;
  }

  /**
   * Deletes the external user account in auth service and ext provider
   * @param externalAuthToken the access token received from ext provider for the user
   * @param externalAuthId the external id from ext provider for user
   * @returns true if deleted successfully
   */
  async deleteUserAccount(externalAuthToken: string, externalAuthId: string) {
    const clientToken = await this.getAuthClientToken();
    await axios.delete(`${process.env.AUTH_API_URL}/accounts/external/${externalAuthId}`, {
      headers: {
        Authorization: `Bearer ${clientToken}`,
      },
      data: { token: externalAuthToken },
    });
    return true;
  }

  async getTokenAndUserInfo(tokenRequest) {
    const { id_token, access_token, refresh_token } = await this.getAuthTokens(tokenRequest);
    const { email, externalId } = await this.decodeAuthIdToken(id_token);

    // If no email available, then account has to be linked first.
    if (!email) {
      this.logger.info(`Initiated account linking for ${externalId}>`);
      return { accessToken: access_token, refreshToken: refresh_token, idToken: id_token, isAccountLinking: true };
    }

    // Find User by externalId
    let foundUser = await this.membersService.findMemberByExternalId(externalId);

    if (foundUser) {
      // Check soft delete
      if (foundUser.deletedAt) {
        this.logger.error(
          `Login attempt for deleted member [uid=${foundUser.uid}, email=${foundUser.email}]. Reason: ${foundUser.deletionReason || 'not specified'}`
        );
        throw new ForbiddenException(foundUser.deletionReason || 'Your account has been deactivated.');
      }

      if (foundUser.email === email) {
        // Track login event
        await this.trackLoginEvent(foundUser);
        return {
          userInfo: this.memberToUserInfo(foundUser),
          refreshToken: refresh_token,
          idToken: id_token,
          accessToken: access_token,
        };
      } else {
        this.logger.error(`Email changed for ${foundUser.uid} | foundUser.email: ${foundUser.email} | email: ${email}`);
        return {
          isEmailChanged: true,
        };
      }
    }

    // Try finding by email if externalId doesn't match any user
    foundUser = await this.membersService.findMemberByEmail(email);
    if (foundUser) {
      // Check soft delete
      if (foundUser.deletedAt) {
        this.logger.error(
          `Login attempt for deleted member [uid=${foundUser.uid}, email=${foundUser.email}]. Reason: ${foundUser.deletionReason || 'not specified'}`
        );
        throw new ForbiddenException(foundUser.deletionReason || 'Your account has been deactivated.');
      }

      if (foundUser.externalId) {
        return {
          isDeleteAccount: true,
        };
      } else {
        await this.membersService.updateExternalIdByEmail(email, externalId);
        this.logger.info(`Updated externalId - ${externalId} for emailId - ${email}`);
        // Track login event
        await this.trackLoginEvent(foundUser);
        return {
          userInfo: this.memberToUserInfo(foundUser),
          refreshToken: refresh_token,
          idToken: id_token,
          accessToken: access_token,
        };
      }
    }

    // if no user found for the email too, then throw forbidden exception
    throw new ForbiddenException('Invalid User');
  }

  async verifyAndSendEmailOtp(email: string) {
    // Throw error if user email is not available in members directory
    const foundUser = await this.membersService.findMemberByEmail(email);
    if (!foundUser) {
      throw new BadRequestException(
        "The entered email doesn't match an email in the directory records. Please try again or contact support"
      );
    }
    // Send OTP
    return await this.emailOtpService.sendEmailOtp(email);
  }

  async resendEmailOtp(otpToken: string) {
    return await this.emailOtpService.resendEmailOtp(otpToken);
  }

  async verifyEmailOtpAndLinkAccount(otp, otpToken, idToken) {
    // Verify Otp
    const { recipient, valid } = await this.emailOtpService.verifyEmailOtp(otp, otpToken);

    if (!valid) {
      return { valid };
    }

    // If user doesnt exist, throw error
    const foundUser = await this.membersService.findMemberByEmail(recipient);
    if (!foundUser) {
      throw new ForbiddenException('Please login and try again');
    }

    // Link account by email
    const newTokens = await this.linkEmailWithAuthAccount(foundUser?.email, idToken);

    // format userinfo
    const userInfo = this.memberToUserInfo(foundUser);

    // If user already has externalId then send new token directly
    if (foundUser.externalId) {
      // Track login event
      await this.trackLoginEvent(foundUser);
      return {
        userInfo,
        refreshToken: newTokens.refresh_token,
        idToken: newTokens.id_token,
        accessToken: newTokens.access_token,
      };
    }
    // Get external Id
    const { externalId } = this.decodeAuthIdToken(newTokens.id_token);

    // Update External Id and return new tokens
    await this.membersService.updateExternalIdByEmail(foundUser.email, externalId);
    // Track login event
    await this.trackLoginEvent(foundUser);
    return {
      refreshToken: newTokens.refresh_token,
      idToken: newTokens.id_token,
      accessToken: newTokens.access_token,
      userInfo: { ...userInfo, isFirstTimeLogin: true },
    };
  }

  async updateEmailInAuth(newEmail, oldEmail, externalId) {
    const clientToken = await this.getAuthClientToken();
    let linkResult;
    try {
      linkResult = await this.getAuthApi().patch(
        `/admin/accounts/email`,
        {
          email: newEmail.toLowerCase().trim(),
          existingEmail: oldEmail.toLowerCase().trim(),
          userId: externalId,
          deleteAndReplace: true,
        },
        {
          headers: {
            Authorization: `Bearer ${clientToken}`,
          },
        }
      );
    } catch (error) {
      this.handleAuthErrors(error);
    }
    return linkResult.data;
  }

  checkIfTokenAttached = (request) => {
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Invalid Session. Please login and try again');
    } else {
      return token;
    }
  };

  extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  validateToken = async (request, token) => {
    const validationResult: any = await axios.post(`${process.env.AUTH_API_URL}/auth/introspect`, { token: token });
    if (validationResult?.data?.active && validationResult?.data?.email) {
      request['userEmail'] = validationResult.data.email;
      return request;
    } else {
      throw new UnauthorizedException();
    }
  };

  /*********************** PRIVATE METHODS ****************************/

  /**
   * Track login event
   * @param foundUser
   */
  private async trackLoginEvent(foundUser) {
    return await this.analyticsService.trackEvent({
      name: foundUser.externalId ? ANALYTICS_EVENTS.AUTH.USER_LOGIN : ANALYTICS_EVENTS.AUTH.USER_FIRST_LOGIN,
      distinctId: foundUser.uid,
      properties: {
        uid: foundUser.uid,
        email: foundUser.email,
        name: foundUser.name,
      },
    });
  }

  private async getClientToken() {
    const response = await axios.post(`${process.env.AUTH_API_URL}/auth/token`, {
      client_id: process.env.AUTH_APP_CLIENT_ID,
      client_secret: process.env.AUTH_APP_CLIENT_SECRET,
      grant_type: 'client_credentials',
      grantTypes: ['client_credentials', 'authorization_code', 'refresh_token'],
    });

    return response.data.access_token;
  }

  private async linkEmailWithAuthAccount(email: string | null, userIdToken: string) {
    const clientToken = await this.getAuthClientToken();
    let linkResult;
    try {
      linkResult = await this.getAuthApi().put(
        `/admin/accounts`,
        { token: userIdToken, email: email?.toLowerCase().trim() },
        {
          headers: {
            Authorization: `Bearer ${clientToken}`,
          },
        }
      );
    } catch (error) {
      this.handleAuthErrors(error);
    }

    return linkResult.data;
  }

  private async getAuthTokens({ grantType, refreshToken, code, exchangeRequestId, exchangeRequestToken }) {
    const payload = {
      client_id: process.env.AUTH_APP_CLIENT_ID,
      client_secret: process.env.AUTH_APP_CLIENT_SECRET,
      grant_type: grantType,
    };
    let result;

    if (grantType === 'authorization_code') {
      (payload['redirect_uri'] = `${process.env.WEB_UI_BASE_URL}/members/verify-member`), (payload['code'] = code);
    } else if (grantType === 'refresh_token') {
      payload['refresh_token'] = refreshToken;
    } else if (grantType === 'token_exchange') {
      payload['token'] = exchangeRequestToken;
      payload['auth_request_id'] = exchangeRequestId;
    }

    try {
      result = await axios.post(`${process.env.AUTH_API_URL}/auth/token`, payload);
      return result.data;
    } catch (error) {
      this.handleAuthErrors(error);
    }
  }

  private decodeAuthIdToken(token: string) {
    const decoded: any = jwt_decode(token);
    return { email: decoded.email, externalId: decoded.sub };
  }

  private memberToUserInfo(memberInfo) {
    return {
      isFirstTimeLogin: memberInfo?.externalId ? false : true,
      name: memberInfo.name,
      email: memberInfo.email,
      profileImageUrl: memberInfo.image?.url,
      uid: memberInfo.uid,
      roles: memberInfo.memberRoles?.map((r) => r.name),
      leadingTeams: memberInfo.teamMemberRoles?.filter((role) => role.teamLead).map((role) => role.teamUid),
      accessLevel: memberInfo.accessLevel,
    };
  }

  private getAuthApi() {
    const authOtpService = axios.create({
      baseURL: `${process.env.AUTH_API_URL}`,
    });
    authOtpService.interceptors.response.use(
      (response) => response,
      (error) => {
        const originalRequest = error.config;
        if (error.response.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          return this.getClientToken().then((accessToken) => {
            this.cacheService.store.set('authserviceClientToken', accessToken, { ttl: 3600 });
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
      throw new UnauthorizedException('Unauthorized');
    } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP005') {
      throw new UnauthorizedException('Unauthorized');
    } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP003') {
      throw new ForbiddenException('MAX_OTP_ATTEMPTS_REACHED');
    } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EATH010') {
      throw new ForbiddenException('ACCOUNT_ALREADY_LINKED');
    } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EATH002') {
      throw new ForbiddenException('ACCOUNT_ALREADY_LINKED');
    } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP006') {
      throw new ForbiddenException('MAX_RESEND_ATTEMPTS_REACHED');
    } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP004') {
      throw new BadRequestException('CODE_EXPIRED');
    } else {
      throw new InternalServerErrorException('Unexpected error. Please try again', { cause: error });
    }
  }

  private async getAuthClientToken() {
    const tokenFromMemory = await this.cacheService.store.get('authserviceClientToken');
    if (tokenFromMemory) {
      return tokenFromMemory;
    }
    const newClientToken = await this.getClientToken();
    await this.cacheService.store.set('authserviceClientToken', newClientToken, { ttl: 3600 });
    return newClientToken;
  }
}
