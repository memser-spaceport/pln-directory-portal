import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { AwsService } from '../aws/aws.service';
import { SlackService } from '../slack/slack.service';
import { getRandomId, isEmails } from '../helper/helper';
import { ONBOARDING_SUBJECT } from '../constants';

@Injectable()
export class NotificationService {
  constructor(private awsService: AwsService, private slackService: SlackService) {}

  /**
   * This method sends notifications when a new member is created.
   * @param memberName The name of the new member
   * @param uid The unique identifier for the member
   * @returns Sends an email to admins and posts a notification to Slack.
   */
  async notifyForCreateMember(memberName: string, uid: string) {
    const backOfficeMemberUrl = `${process.env.WEB_ADMIN_UI_BASE_URL}/member-view?id=${uid}`;
    const slackConfig = { requestLabel: 'New Labber Request', url: backOfficeMemberUrl, name: memberName };
    await this.awsService.sendEmail('NewMemberRequest', true, [], {
      memberName: memberName,
      requestUid: uid,
      adminSiteUrl: backOfficeMemberUrl,
    });
    await this.slackService.notifyToChannel(slackConfig);
  }

  /**
   * This method sends notifications when a member's profile is edited.
   * @param memberName The name of the member whose profile is edited
   * @param uid The unique identifier for the member
   * @param requesterEmailId The email address of the person who requested the edit
   * @returns Sends an email to admins and posts a notification to Slack.
   */
  async notifyForEditMember(memberName: string, uid: string, requesterEmailId: string) {
    const backOfficeMemberUrl = `${process.env.WEB_ADMIN_UI_BASE_URL}/member-view?id=${uid}`;
    const slackConfig = { requestLabel: 'Edit Labber Request', url: backOfficeMemberUrl, name: memberName };
    await this.awsService.sendEmail('EditMemberRequest', true, [], {
      memberName,
      requestUid: uid,
      adminSiteUrl: backOfficeMemberUrl,
      requesterEmailId,
    });
    await this.slackService.notifyToChannel(slackConfig);
  }

  /**
   * This method sends notifications when a new team is created.
   * @param teamName The name of the new team
   * @param uid The unique identifier for the team
   * @returns Sends an email to admins and posts a notification to Slack.
   */
  async notifyForCreateTeam(teamName: string, uid: string) {
    const backOfficeTeamUrl = `${process.env.WEB_ADMIN_UI_BASE_URL}/team-view?id=${uid}`;
    const slackConfig = { requestLabel: 'New Team Request', url: backOfficeTeamUrl, name: teamName };
    await this.awsService.sendEmail('NewTeamRequest', true, [], {
      teamName,
      requestUid: uid,
      adminSiteUrl: backOfficeTeamUrl,
    });
    await this.slackService.notifyToChannel(slackConfig);
  }

  /**
   * This method sends notifications when a team's profile is edited.
   * @param teamName The name of the team whose profile is edited
   * @param teamUid The unique identifier for the team
   * @param uid The unique identifier for the edit request
   * @returns Sends an email to admins and posts a notification to Slack.
   */
  async notifyForEditTeam(teamName: string, teamUid: string, uid: string) {
    const backOfficeTeamUrl = `${process.env.WEB_ADMIN_UI_BASE_URL}/team-view?id=${uid}`;
    const slackConfig = { requestLabel: 'Edit Team Request', url: backOfficeTeamUrl, name: teamName };
    await this.awsService.sendEmail('EditTeamRequest', true, [], {
      teamName,
      teamUid,
      requestUid: uid,
      adminSiteUrl: backOfficeTeamUrl,
    });
    await this.slackService.notifyToChannel(slackConfig);
  }

  /**
   * This method sends notifications after a member is approved.
   * @param memberName The name of the member being approved
   * @param uid The unique identifier for the member
   * @param memberEmail The email address of the member being approved
   * @returns Sends an approval email to the member and posts a notification to Slack.
   */
  async notifyForMemberCreationApproval(memberName: string, uid: string, memberEmail: string, isOnboarding: boolean) {
    if (isOnboarding) {
      await this.notifyForOnboarding(memberName, memberEmail);
    } else {
      await this.notifyForMemberApproved(memberName, memberEmail, uid);
    }

    const memberUrl = `${
      process.env.WEB_UI_BASE_URL
    }/members/${uid}?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`;
    const slackConfig = { requestLabel: 'New Labber Added', url: memberUrl, name: memberName };
    await this.slackService.notifyToChannel(slackConfig);
  }

  /**
   * This method sends notifications after a member's profile is approved for edits.
   * @param memberName The name of the member whose profile was edited
   * @param uid The unique identifier for the member
   * @param memberEmail The email address of the member
   * @returns Sends an email notifying approval and posts a notification to Slack.
   */
  async notifyForMemberEditApproval(memberName: string, uid: string, memberEmail: string) {
    const memberUrl = `${
      process.env.WEB_UI_BASE_URL
    }/members/${uid}?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`;
    const slackConfig = { requestLabel: 'Edit Labber Request Completed', url: memberUrl, name: memberName };
    await this.awsService.sendEmail('MemberEditRequestCompleted', true, [], {
      memberName,
      memberUid: uid,
      adminSiteUrl: memberUrl,
    });
    await this.awsService.sendEmail('EditMemberSuccess', false, [memberEmail], {
      memberName,
      memberProfileLink: memberUrl,
    });
    await this.slackService.notifyToChannel(slackConfig);
  }

  /**
   * This method sends an acknowledgment email when an admin changes a member's email.
   * @param memberName The name of the member whose email is being changed
   * @param uid The unique identifier for the member
   * @param memberOldEmail The member's old email address
   * @param memberNewEmail The member's new email address
   * @returns Sends an email to both the old and new email addresses.
   */
  async notifyForMemberChangesByAdmin(memberName: string, uid: string, memberOldEmail: string, memberNewEmail: string) {
    const memberUrl = `${
      process.env.WEB_UI_BASE_URL
    }/members/${uid}?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`;
    await this.awsService.sendEmail('MemberEmailChangeAcknowledgement', false, [memberOldEmail, memberNewEmail], {
      oldEmail: memberOldEmail,
      newEmail: memberNewEmail,
      memberName,
      profileURL: memberUrl,
      loginURL: process.env.LOGIN_URL,
    });
  }

  /**
   * This method sends notifications after a team creation request is approved.
   * @param teamName The name of the team being approved
   * @param teamUid The unique identifier for the team
   * @param requesterEmailId The email address of the person who requested the team creation
   * @returns Sends an email notifying approval and posts a notification to Slack.
   */
  async notifyForTeamCreationApproval(teamName: string, teamUid: string, requesterEmailId: string) {
    const teamUrl = `${
      process.env.WEB_UI_BASE_URL
    }/teams/${teamUid}?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`;
    const slackConfig = { requestLabel: 'New Team Added', url: teamUrl, name: teamName };
    await this.awsService.sendEmail('TeamCreated', true, [], { teamName, teamUid, adminSiteUrl: teamUrl });
    await this.awsService.sendEmail('NewTeamSuccess', false, [requesterEmailId], {
      teamName,
      teamProfileLink: teamUrl,
    });
    await this.slackService.notifyToChannel(slackConfig);
  }

  /**
   * This method sends notifications after a team edit request is approved.
   * @param teamName The name of the team that was edited
   * @param teamUid The unique identifier for the team
   * @param requesterEmailId The email address of the person who requested the team edit
   * @returns Sends an email notifying approval and posts a notification to Slack.
   */
  async notifyForTeamEditApproval(teamName: string, teamUid: string, requesterEmailId: string) {
    const teamUrl = `${
      process.env.WEB_UI_BASE_URL
    }/teams/${teamUid}?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`;
    const slackConfig = { requestLabel: 'Edit Team Request Completed', url: teamUrl, name: teamName };
    await this.awsService.sendEmail('TeamEditRequestCompleted', true, [], { teamName, teamUid, adminSiteUrl: teamUrl });
    await this.awsService.sendEmail('EditTeamSuccess', false, [requesterEmailId], {
      teamName,
      memberProfileLink: teamUrl,
    });
    await this.slackService.notifyToChannel(slackConfig);
  }

  /**
   * This method sends notifications for onboarding.
   * @param memberName The name of the member being onboarded
   * @param memberEmail The email address of the member being onboarded
   * @returns Sends an email to the member with the onboarding link.
   */
  async notifyForOnboarding(memberName: string, memberEmail: string, subject = ONBOARDING_SUBJECT) {
    const memberUrl = `${process.env.WEB_UI_BASE_URL}/?loginFlow=onboarding&prefillEmail=${encodeURIComponent(
      memberEmail
    )}`;
    await this.awsService.sendEmailWithTemplate(
      path.join(__dirname, '/shared/onboarding.hbs'),
      {
        name: memberName,
        onboarding_link: memberUrl,
        from: 'La Christa Eccles',
      },
      '',
      subject,
      process.env.SES_SOURCE_EMAIL || '',
      [memberEmail],
      [],
      this.getSupportEmail()
    );
  }

  async notifyForMemberApproved(memberName: string, memberEmail: string, memberUid: string) {
    const memberUrl = `${
      process.env.WEB_UI_BASE_URL
    }/members?utm_source=member_approval&prefillEmail=${encodeURIComponent(
      memberEmail
    )}&loginFlow=login&target_uid=${memberUid}&target_email=${encodeURIComponent(memberEmail)}`;
    await this.awsService.sendEmailWithTemplate(
      path.join(__dirname, '/shared/memberApproved.hbs'),
      {
        name: memberName,
        link: memberUrl,
      },
      '',
      `Welcome, ${memberName} to Protocol Labs!`,
      process.env.SES_SOURCE_EMAIL || '',
      [memberEmail],
      [],
      this.getSupportEmail()
    );
  }

  async notifyForRejection(memberName: string, memberEmail: string) {
    await this.awsService.sendEmailWithTemplate(
      path.join(__dirname, '/shared/memberRejected.hbs'),
      {
        name: memberName,
      },
      '',
      `Your application to join Protocol Labs network`,
      process.env.SES_SOURCE_EMAIL || '',
      [memberEmail],
      [],
      this.getSupportEmail()
    );
  }

  private getSupportEmail(): string | undefined {
    const supportEmails = process.env.SUPPORT_EMAILS?.split(',') ?? [];
    if (isEmails(supportEmails)) {
      return supportEmails[0];
    }
  }
}
