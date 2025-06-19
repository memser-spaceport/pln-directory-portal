import { Injectable, NotFoundException } from '@nestjs/common';
import { Member, MemberExperience, MemberRole, ProjectContribution, Skill } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfileCompletenessBy(memberUid: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      include: {
        skills: true,
        projectContributions: true,
        memberRoles: true,
        experiences: true,
      },
    });

    if (!member) {
      throw new NotFoundException(`Member with ${memberUid} has not been found`);
    }

    const completenessResult = this.calculateProfileCompleteness(member);

    return {
      memberUid,
      completeness: completenessResult.total,
      sections: {
        profileDetails: completenessResult.sections.profileDetails,
        contactDetails: completenessResult.sections.contactDetails,
        teamRole: completenessResult.sections.teamRole,
        experience: completenessResult.sections.experience,
        repositories: completenessResult.sections.repositories,
        projectContributions: completenessResult.sections.projectContributions,
      },
    };
  }

  calculateProfileCompleteness(
    member: Member & {
      skills: Skill[];
      projectContributions: ProjectContribution[];
      memberRoles: MemberRole[];
      experiences: MemberExperience[];
    }
  ) {
    let profileDetails = 0;
    if (member.bio) profileDetails += 5;
    if (member.locationUid) profileDetails += 5;
    if (member.skills && member.skills.length > 0) profileDetails += 5;
    if (member.name) profileDetails += 5;
    if (member.imageUid) profileDetails += 10;

    let contactDetails = 0;
    if (member.githubHandler) contactDetails += 5;
    if (member.linkedinHandler) contactDetails += 5;
    if (member.discordHandler) contactDetails += 2;
    if (member.twitterHandler) contactDetails += 3;
    if (member.officeHours) contactDetails += 5;
    if (member.telegramHandler) contactDetails += 5;

    let teamRole = 0;
    if (member.memberRoles && member.memberRoles.length > 0) teamRole += 5;
    if (member.teamOrProjectURL) teamRole += 10;

    let experience = 0;
    if (member.experiences && member.experiences.length > 0) experience += 5;

    let repositories = 0;
    if (member.githubHandler) repositories += 10;

    let projectContributions = 0;
    if (member.projectContributions && member.projectContributions.length > 0) projectContributions += 15;

    const total = Math.min(
      profileDetails + contactDetails + teamRole + experience + repositories + projectContributions,
      100
    );

    return {
      total,
      sections: {
        profileDetails,
        contactDetails,
        teamRole,
        experience,
        repositories,
        projectContributions,
      },
    };
  }
}
