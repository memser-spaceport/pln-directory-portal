import {
  BadRequestException,
  CACHE_MANAGER,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException, NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import jwt_decode from 'jwt-decode';
import {Cache} from 'cache-manager';
import {MembersService} from '../members/members.service';
import {EmailOtpService} from '../otp/email-otp.service';
import {ModuleRef} from '@nestjs/core';
import {LogService} from '../shared/log.service';
import {AnalyticsService} from '../analytics/service/analytics.service';
import {ANALYTICS_EVENTS} from '../utils/constants';
import {PrismaService} from '../shared/prisma.service';
import {AuthMetrics, extractErrorCode, statusClassOf} from '../metrics/auth.metrics';
import {TeamsService} from '../teams/teams.service';
import {NotificationServiceClient} from '../notifications/notification-service.client';
import {NotFoundError} from "@prisma/client/runtime";

@Injectable()
export class AuthService implements OnModuleInit {
  private membersService: MembersService;
  private teamsService: TeamsService;
  constructor(
    private moduleRef: ModuleRef,
    private emailOtpService: EmailOtpService,
    private logger: LogService,
    @Inject(CACHE_MANAGER) private cacheService: Cache,
    private analyticsService: AnalyticsService,
    private prisma: PrismaService,
    private notificationServiceClient: NotificationServiceClient
  ) {}

  onModuleInit() {
    this.membersService = this.moduleRef.get(MembersService, { strict: false });
    this.teamsService = this.moduleRef.get(TeamsService, { strict: false });
  }

  private async authCall(op: string, fn: () => Promise<any>) {
    AuthMetrics.requests.inc({ op });
    const end = AuthMetrics.duration.startTimer({ op });
    try {
      return await fn();
    } catch (e) {
      const httpStatus = e?.response?.status ?? e?.status ?? e?.statusCode ?? 0;
      const statusClass = statusClassOf(httpStatus);
      const errorCode = extractErrorCode(e);
      AuthMetrics.errors.inc({
        op,
        status_class: statusClass,
        http_status: String(httpStatus),
        error_code: String(errorCode),
      });
      throw e;
    } finally {
      end();
    }
  }

  async createAuthRequest(authRequest) {
    const output = await this.authCall('create_auth_request', () =>
      axios.post(`${process.env.AUTH_API_URL}/auth`, {
        state: authRequest.state,
        client_id: process.env.AUTH_APP_CLIENT_ID,
      })
    );
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
    await this.authCall('delete_external_account', () =>
      axios.delete(`${process.env.AUTH_API_URL}/accounts/external/${externalAuthId}`, {
        headers: { Authorization: `Bearer ${clientToken}` },
        data: { token: externalAuthToken },
      })
    );
    return true;
  }

  async getTokenAndUserInfo(tokenRequest) {
    // 1. Ask auth-service (dev-auth) to exchange the external token for internal tokens
    const { id_token, access_token, refresh_token } = await this.getAuthTokens(tokenRequest);

    // 2. Decode id_token to extract email + externalId (Privy DID or equivalent)
    const decoded: any = await this.decodeAuthIdToken(id_token);

    const email: string | null = decoded?.email ?? null;
    // externalId is usually Privy DID; if not present explicitly, fall back to `sub`
    const externalId: string | null = decoded?.externalId ?? decoded?.sub ?? null;

    this.logger.info(
      `AuthService.getTokenAndUserInfo → Decoded id_token: email=${email}, externalId=${externalId}`,
    );

    // 3. If there is no email, we cannot safely attach the login to any member.
    //    In this case we fall back to the "account linking" flow (OTP, etc.)
    if (!email) {
      this.logger.info(
        `AuthService.getTokenAndUserInfo → No email in id_token for externalId=${externalId}. Starting account linking flow.`,
      );
      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        idToken: id_token,
        isAccountLinking: true,
      };
    }

    // ---------------------------------------------
    // 4. Try to find a member by externalId (Privy DID)
    // ---------------------------------------------
    let foundUser =
      externalId != null ? await this.membersService.findMemberByExternalId(externalId) : null;

    if (foundUser) {
      // Soft-deleted member should never be allowed to log in
      if (foundUser.deletedAt) {
        this.logger.error(
          `AuthService.getTokenAndUserInfo → Login attempt for deleted member [uid=${foundUser.uid}, email=${foundUser.email}]. Reason: ${
            foundUser.deletionReason || 'not specified'
          }`,
        );
        throw new ForbiddenException(
          foundUser.deletionReason || 'Your account has been deactivated.',
        );
      }

      if (foundUser.email === email) {
        this.logger.info(
          `AuthService.getTokenAndUserInfo → Member found by externalId=${externalId} and email matches. uid=${foundUser.uid}`,
        );

        // Run demo-day upgrade logic if necessary
        const upgradedUser = await this.checkAndUpgradeDemoDayParticipant(foundUser);

        // Track login event for analytics/auditing
        await this.trackLoginEvent(upgradedUser);

        return {
          userInfo: this.memberToUserInfo(upgradedUser),
          refreshToken: refresh_token,
          idToken: id_token,
          accessToken: access_token,
        };
      } else {
        // Same externalId but email changed – keep existing frontend semantics
        this.logger.error(
          `AuthService.getTokenAndUserInfo → Email mismatch for uid=${foundUser.uid}. stored=${foundUser.email}, token=${email}`,
        );
        return {
          isEmailChanged: true,
        };
      }
    }

    // ---------------------------------------------
    // 5. No member for this externalId → try to find by email
    // ---------------------------------------------
    foundUser = await this.membersService.findMemberByEmail(email);

    if (foundUser) {
      // Soft-deleted member should never be allowed to log in
      if (foundUser.deletedAt) {
        this.logger.error(
          `AuthService.getTokenAndUserInfo → Login attempt for deleted member [uid=${foundUser.uid}, email=${foundUser.email}]. Reason: ${
            foundUser.deletionReason || 'not specified'
          }`,
        );
        throw new ForbiddenException(
          foundUser.deletionReason || 'Your account has been deactivated.',
        );
      }

      if (foundUser.externalId) {
        // Member already has some externalId, but auth token comes with a different one.
        // Preserve previous behavior – ask frontend to resolve the conflict.
        this.logger.error(
          `AuthService.getTokenAndUserInfo → Member [uid=${foundUser.uid}, email=${foundUser.email}] already has externalId=${foundUser.externalId}, new externalId=${externalId}`,
        );
        return {
          isDeleteAccount: true,
        };
      } else {
        // Attach externalId (Privy DID) to existing member
        this.logger.info(
          `AuthService.getTokenAndUserInfo → Attaching externalId=${externalId} to existing member with email=${email}`,
        );

        if (externalId) {
          await this.membersService.updateExternalIdByEmail(email, externalId);
        } else {
          this.logger.info(
            `AuthService.getTokenAndUserInfo → externalId is null while trying to attach it to member with email=${email}`,
          );
        }

        const upgradedUser = await this.checkAndUpgradeDemoDayParticipant(foundUser);
        await this.trackLoginEvent(upgradedUser);

        return {
          userInfo: this.memberToUserInfo(upgradedUser),
          refreshToken: refresh_token,
          idToken: id_token,
          accessToken: access_token,
        };
      }
    }

    // ---------------------------------------------
    // 6. No member by externalId and no member by email → first SSO login
    //    → create a new member automatically from SSO data.
    // ---------------------------------------------
    this.logger.info(
      `AuthService.getTokenAndUserInfo → No member found for externalId=${externalId} or email=${email}. Creating new member from SSO login.`,
    );

    // // 6.1. Create raw member record
    // await this.membersService.createMemberFromSso({
    //   email,
    //   externalId,
    // });

    // 6.2. Reload member with full relations so that memberToUserInfo doesn't crash
    let newUser =
      externalId != null
        ? await this.membersService.findMemberByExternalId(externalId)
        : await this.membersService.findMemberByEmail(email);

    if (!newUser) {
      // This should not normally happen, but better to log loudly if something goes wrong
      this.logger.error(
        `AuthService.getTokenAndUserInfo → Newly created SSO member not found when reloading. email=${email}, externalId=${externalId}`,
      );
      throw new NotFoundException('Unable to load newly created user');
    }

    const upgradedNewUser = await this.checkAndUpgradeDemoDayParticipant(newUser);
    await this.trackLoginEvent(upgradedNewUser);

    this.logger.info(
      `AuthService.getTokenAndUserInfo → New member created from SSO. uid=${upgradedNewUser.uid}, email=${upgradedNewUser.email}`,
    );

    return {
      userInfo: this.memberToUserInfo(upgradedNewUser),
      refreshToken: refresh_token,
      idToken: id_token,
      accessToken: access_token,
    };
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
      linkResult = await this.authCall('update_email', () =>
        this.getAuthApi().patch(
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
        )
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
    const validationResult: any = await this.authCall('introspect', () =>
      axios.post(`${process.env.AUTH_API_URL}/auth/introspect`, { token: token })
    );
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
    const response = await this.authCall('client_token', () =>
      axios.post(`${process.env.AUTH_API_URL}/auth/token`, {
        client_id: process.env.AUTH_APP_CLIENT_ID,
        client_secret: process.env.AUTH_APP_CLIENT_SECRET,
        grant_type: 'client_credentials',
        grantTypes: ['client_credentials', 'authorization_code', 'refresh_token'],
      })
    );
    return response.data.access_token;
  }

  private async linkEmailWithAuthAccount(email: string | null, userIdToken: string) {
    const clientToken = await this.getAuthClientToken();
    let linkResult;
    try {
      linkResult = await this.authCall('link_account', () =>
        this.getAuthApi().put(
          `/admin/accounts`,
          { token: userIdToken, email: email?.toLowerCase().trim() },
          {
            headers: {
              Authorization: `Bearer ${clientToken}`,
            },
          }
        )
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
      result = await this.authCall(`get_tokens.${grantType}`, () =>
        axios.post(`${process.env.AUTH_API_URL}/auth/token`, payload)
      );
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
    const team = memberInfo.teamMemberRoles?.find((role) => role.mainTeam)?.team || memberInfo.teamMemberRoles[0]?.team;
    return {
      isFirstTimeLogin: memberInfo?.externalId ? false : true,
      name: memberInfo.name,
      email: memberInfo.email,
      profileImageUrl: memberInfo.image?.url,
      uid: memberInfo.uid,
      roles: memberInfo.memberRoles?.map((r) => r.name),
      leadingTeams: memberInfo.teamMemberRoles?.filter((role) => role.teamLead).map((role) => role.teamUid),
      mainTeamName: team?.name,
      accessLevel: memberInfo.accessLevel,
      isTierViewer: memberInfo.isTierViewer ?? false,
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

  private async checkAndUpgradeDemoDayParticipant(member: any): Promise<any> {
    // Only process L0 members
    if (member.accessLevel !== 'L0' && !!member.externalId) {
      return member;
    }

    // Check if member has invited demo day participants
    const invitedParticipant = await this.prisma.demoDayParticipant.findFirst({
      where: {
        memberUid: member.uid,
        status: { in: ['INVITED', 'ENABLED'] },
        isDeleted: false,
      },
    });

    if (!invitedParticipant) {
      return member;
    }

    // Determine new access level based on participant type
    const newAccessLevel = invitedParticipant.type === 'INVESTOR' ? 'L5' : 'L3';

    // Update member access level and participant status in transaction
    await this.prisma.$transaction(async (tx) => {
      // Update member access level
      await tx.member.update({
        where: { uid: member.uid },
        data: {
          accessLevel: newAccessLevel,
          accessLevelUpdatedAt: new Date(),
        },
      });

      // Save previous status for analytics
      const prevStatus = invitedParticipant.status;

      // Update participant status to enabled
      const updatedParticipant = await tx.demoDayParticipant.update({
        where: { uid: invitedParticipant.uid },
        data: {
          status: 'ENABLED',
          statusUpdatedAt: new Date(),
        },
      });

      // Update access levels for all teams the member belongs to
      const memberTeams = await tx.teamMemberRole.findMany({
        where: { memberUid: member.uid },
        select: { teamUid: true },
      });

      // Update each team's access level if they were previously L0
      for (const teamRole of memberTeams) {
        await this.teamsService.updateTeamAccessLevel(teamRole.teamUid, tx);
      }

      if (invitedParticipant.type === 'INVESTOR') {
        // This is an additive analytics call; no changes to existing logs/comments
        await this.trackInvestorSign(member, invitedParticipant, newAccessLevel);
      }

      // Track participant status change (INVITED -> ENABLED)
      // Note: using plain string for event name to avoid touching constants
      await this.analyticsService.trackEvent({
        name: 'demo-day-participant-status-changed',
        distinctId: member.uid,
        properties: {
          memberUid: member.uid,
          email: member.email,
          demoDayUid: invitedParticipant.demoDayUid,
          participantUid: invitedParticipant.uid,
          type: invitedParticipant.type,
          fromStatus: prevStatus,
          toStatus: updatedParticipant.status,
        },
      });
    });

    this.logger.info(
      `Upgraded demo day participant: member=${member.uid}, type=${invitedParticipant.type}, accessLevel=${newAccessLevel}`
    );

    // Return updated member
    return {
      ...member,
      accessLevel: newAccessLevel,
      accessLevelUpdatedAt: new Date(),
    };
  }

  /**
   * Track "investor sign" event once investor is enabled/upgraded
   * (This is additive only; no changes to existing code paths)
   */
  private async trackInvestorSign(member: any, invitedParticipant: any, newAccessLevel: string) {
    await this.analyticsService.trackEvent({
      name: 'investor-invitation-accepted',
      distinctId: member.uid,
      properties: {
        uid: member.uid,
        email: member.email,
        name: member.name,
        demoDayUid: invitedParticipant.demoDayUid,
        participantUid: invitedParticipant.uid,
        newAccessLevel,
      },
    });
  }

  async reportAuthLinkIssue(name: string, email: string) {
    const adminEmailIdsFromEnv = process.env.SES_ADMIN_EMAIL_IDS;
    const adminEmailIds = adminEmailIdsFromEnv?.split('|') ?? [];

    const payload = {
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName: 'AUTH_LINK_ISSUE_REPORT',
      recipientsInfo: {
        to: adminEmailIds,
      },
      deliveryPayload: {
        body: {
          name: name || 'Unknown Name',
          email: email || 'Unknown Email',
        },
      },
      entityType: 'AUTH',
      actionType: 'LINK_ISSUE_REPORT',
      sourceMeta: {
        activityId: '',
        activityType: 'AUTH_LINK_ISSUE',
        activityUserId: '',
        activityUserName: name,
      },
      targetMeta: {
        emailId: email,
        userId: '',
        userName: name,
      },
    };

    await this.notificationServiceClient.sendNotification(payload);
    return { message: 'Issue reported successfully' };
  }
}
