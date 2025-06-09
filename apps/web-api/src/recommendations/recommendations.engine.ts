import {
  Member,
  TeamMemberRole,
  MemberInteraction,
  PLEventGuest,
  Team,
  TeamFocusArea,
  MemberExperience,
} from '@prisma/client';

// Score constants
const SCORES = {
  SAME_TEAM: 0,
  DIFFERENT_TEAM: 1,
  PREVIOUSLY_RECOMMENDED: 0,
  NOT_PREVIOUSLY_RECOMMENDED: 1,
  BOOKED_OH: 0,
  NOT_BOOKED_OH: 1,
  SAME_EVENT: 0,
  DIFFERENT_EVENT: 1,
  MATCHING_FOCUS_AREA: 5,
  MATCHING_FUNDING_STAGE: 5,
  MATCHING_ROLE: 5,
  MATCHING_TECHNOLOGY: 1,
  MATCHING_INDUSTRY_TAG: 5,
  HAS_OFFICE_HOURS: 1,
  NO_OFFICE_HOURS: 0,
  JOIN_DATE: {
    LESS_THAN_1_MONTH: 3,
    LESS_THAN_3_MONTHS: 2,
    LESS_THAN_6_MONTHS: 1,
    MORE_THAN_6_MONTHS: 0,
  },
  MIN_SCORE: 1,
};

export interface RecommendationConfig {
  // Filtering options
  skipTeamNames?: string[];
  skipMemberIds?: string[];
  skipMemberNames?: string[];
  skipIndustryTags?: string[];

  // Scoring factors to include/exclude
  includeFocusAreas?: boolean;
  includeRoles?: boolean;
  includeFundingStages?: boolean;
  includeSameEvent?: boolean;
}

export interface MemberWithRelations extends Member {
  teamMemberRoles: (TeamMemberRole & {
    team: Team & {
      teamFocusAreas: (TeamFocusArea & {
        focusArea: { title: string };
      })[];
      fundingStage?: { title: string };
      technologies: { title: string }[];
      industryTags: { title: string }[];
    };
  })[];
  interactions: MemberInteraction[];
  targetInteractions: MemberInteraction[];
  eventGuests: PLEventGuest[];
  experiences: MemberExperience[];
}

export interface RecommendationScore {
  member: MemberWithRelations;
  score: number;
  factors: RecommendationFactors;
}

export interface RecommendationFactors {
  sameTeam: number;
  previouslyRecommended: number;
  bookedOH: number;
  sameEvent: number;
  teamFocusArea: number;
  teamFundingStage: number;
  roleMatch: number;
  teamTechnology: number;
  teamIndustryTag: number;
  hasOfficeHours: number;
  joinDateScore: number;
  matchedFocusAreas: string[];
  matchedTechnologies: string[];
  matchedFundingStages: string[];
  matchedRoles: string[];
  matchedIndustryTags: string[];
}

export class RecommendationsEngine {
  public getRecommendations(
    targetMember: MemberWithRelations,
    allMembers: MemberWithRelations[],
    config: RecommendationConfig
  ): RecommendationScore[] {
    // Filter out target member and members that are in the skip list
    let filteredMembers = allMembers.filter(
      (m) =>
        m.uid !== targetMember.uid &&
        !config.skipMemberIds?.includes(m.uid) &&
        !config.skipMemberNames?.includes(m.name)
    );

    // Filter out members that are in the team skip list
    if (config.skipTeamNames?.length) {
      filteredMembers = filteredMembers.filter(
        (member) =>
          !member.experiences.some((experience) =>
            config.skipTeamNames!.some((skipName) => experience.company.toLowerCase().includes(skipName.toLowerCase()))
          ) &&
          !member.teamMemberRoles.some((role) =>
            config.skipTeamNames!.some((skipName) => role.team?.name?.toLowerCase().includes(skipName.toLowerCase()))
          )
      );
    }

    // Filter out members that are in teams with matching industry tags
    if (config.skipIndustryTags?.length) {
      filteredMembers = filteredMembers.filter(
        (member) =>
          !member.teamMemberRoles.some((role) =>
            role.team?.industryTags?.some((tag) =>
              config.skipIndustryTags!.some((skipTag) => tag.title.toLowerCase().includes(skipTag.toLowerCase()))
            )
          )
      );
    }

    if (config.includeSameEvent) {
      filteredMembers = filteredMembers.filter((member) =>
        member.eventGuests.some((guest) =>
          targetMember.eventGuests.some((targetGuest) => guest.eventUid === targetGuest.eventUid)
        )
      );
    }

    const scoredMembers = filteredMembers.map((member) =>
      this.calculateRecommendationScore(member, targetMember, config)
    );

    return scoredMembers.filter((member) => member.score >= SCORES.MIN_SCORE).sort((a, b) => b.score - a.score);
  }

  public calculateRecommendationScore(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    config: RecommendationConfig
  ): RecommendationScore {
    // Collect matched items
    const matchedFocusAreas = this.getMatchedFocusAreas(member, targetMember);
    const matchedTechnologies = this.getMatchedTechnologies(member, targetMember);
    const matchedFundingStages = this.getMatchedFundingStages(member, targetMember);
    const matchedRoles = this.getMatchedRoles(member, targetMember);
    const matchedIndustryTags = this.getMatchedIndustryTags(member, targetMember);

    const factors = {
      sameTeam: member.teamMemberRoles.some((role) =>
        targetMember.teamMemberRoles.some((targetRole) => role.teamUid === targetRole.teamUid)
      )
        ? SCORES.SAME_TEAM
        : SCORES.DIFFERENT_TEAM,

      previouslyRecommended: this.hasBookedOH(member, targetMember)
        ? SCORES.PREVIOUSLY_RECOMMENDED
        : SCORES.NOT_PREVIOUSLY_RECOMMENDED,

      bookedOH: member.interactions.some(
        (interaction) => interaction.targetMemberUid === targetMember.uid && interaction.type === 'OFFICE_HOURS'
      )
        ? SCORES.BOOKED_OH
        : SCORES.NOT_BOOKED_OH,

      sameEvent: this.hasSameEvent(member, targetMember) ? SCORES.SAME_EVENT : SCORES.DIFFERENT_EVENT,

      teamFocusArea: config.includeFocusAreas ? (matchedFocusAreas.length > 0 ? SCORES.MATCHING_FOCUS_AREA : 0) : 0,

      teamFundingStage: config.includeFundingStages
        ? matchedFundingStages.length > 0
          ? SCORES.MATCHING_FUNDING_STAGE
          : 0
        : 0,

      roleMatch: config.includeRoles
        ? this.calculateRoleMatchScore(member.teamMemberRoles, targetMember.teamMemberRoles)
        : 0,

      teamTechnology: matchedTechnologies.length > 0 ? SCORES.MATCHING_TECHNOLOGY : 0,

      teamIndustryTag: matchedIndustryTags.length > 0 ? SCORES.MATCHING_INDUSTRY_TAG : 0,

      hasOfficeHours: member.officeHours ? SCORES.HAS_OFFICE_HOURS : SCORES.NO_OFFICE_HOURS,

      joinDateScore: this.calculateJoinDateScore(member.plnStartDate),

      matchedFocusAreas,
      matchedTechnologies,
      matchedFundingStages,
      matchedRoles,
      matchedIndustryTags,
    };

    const score =
      factors.sameTeam *
      factors.previouslyRecommended *
      factors.bookedOH *
      factors.sameEvent *
      (factors.teamFocusArea +
        factors.teamFundingStage +
        factors.roleMatch +
        factors.teamTechnology +
        factors.teamIndustryTag +
        factors.hasOfficeHours +
        factors.joinDateScore);

    return {
      member,
      score,
      factors,
    };
  }

  private calculateRoleMatchScore(memberRoles: TeamMemberRole[], targetRoles: TeamMemberRole[]): number {
    if (!memberRoles.length || !targetRoles.length) return SCORES.NO_OFFICE_HOURS;

    const matchedRoles = this.getMatchedRoles(
      { teamMemberRoles: memberRoles } as MemberWithRelations,
      { teamMemberRoles: targetRoles } as MemberWithRelations
    );

    return matchedRoles.length > 0 ? SCORES.MATCHING_ROLE : SCORES.NO_OFFICE_HOURS;
  }

  private calculateJoinDateScore(joinDate: Date | null): number {
    if (!joinDate) return SCORES.JOIN_DATE.MORE_THAN_6_MONTHS;

    const now = new Date();
    const monthsDiff = (now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

    if (monthsDiff < 1) return SCORES.JOIN_DATE.LESS_THAN_1_MONTH;
    if (monthsDiff < 3) return SCORES.JOIN_DATE.LESS_THAN_3_MONTHS;
    if (monthsDiff < 6) return SCORES.JOIN_DATE.LESS_THAN_6_MONTHS;
    return SCORES.JOIN_DATE.MORE_THAN_6_MONTHS;
  }

  private hasBookedOH(member: MemberWithRelations, targetMember: MemberWithRelations): boolean {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return member.interactions.some(
      (interaction) => interaction.targetMemberUid === targetMember.uid && interaction.createdAt >= sixMonthsAgo
    );
  }

  private hasSameEvent(member: MemberWithRelations, targetMember: MemberWithRelations): boolean {
    const memberEventIds = member.eventGuests.map((guest) => guest.eventUid);
    const targetEventIds = targetMember.eventGuests.map((guest) => guest.eventUid);

    return memberEventIds.some((eventId) => targetEventIds.includes(eventId));
  }

  private getMatchedFocusAreas(member: MemberWithRelations, targetMember: MemberWithRelations): string[] {
    const targetFocusAreas = targetMember.teamMemberRoles
      .flatMap((role) => role.team.teamFocusAreas)
      .map((focusArea) => focusArea.focusArea.title);

    const memberFocusAreas = member.teamMemberRoles
      .flatMap((role) => role.team.teamFocusAreas)
      .map((focusArea) => focusArea.focusArea.title);

    return [...new Set(targetFocusAreas.filter((area) => memberFocusAreas.includes(area)))];
  }

  private getMatchedTechnologies(member: MemberWithRelations, targetMember: MemberWithRelations): string[] {
    const targetTechnologies = targetMember.teamMemberRoles
      .flatMap((role) => role.team.technologies)
      .map((tech) => tech.title);

    const memberTechnologies = member.teamMemberRoles
      .flatMap((role) => role.team.technologies)
      .map((tech) => tech.title);

    return [...new Set(targetTechnologies.filter((tech) => memberTechnologies.includes(tech)))];
  }

  private getMatchedFundingStages(member: MemberWithRelations, targetMember: MemberWithRelations): string[] {
    const targetFundingStages = targetMember.teamMemberRoles
      .map((role) => role.team.fundingStage?.title)
      .filter(Boolean) as string[];

    const memberFundingStages = member.teamMemberRoles
      .map((role) => role.team.fundingStage?.title)
      .filter(Boolean) as string[];

    return [...new Set(targetFundingStages.filter((stage) => memberFundingStages.includes(stage)))];
  }

  private getMatchedRoles(member: MemberWithRelations, targetMember: MemberWithRelations): string[] {
    const memberRoles = member.teamMemberRoles.map((role) => role.role?.toLowerCase()).filter(Boolean) as string[];
    const targetRoles = targetMember.teamMemberRoles
      .map((role) => role.role?.toLowerCase())
      .filter(Boolean) as string[];

    const memberRoleTags = member.teamMemberRoles.flatMap(
      (role) => role.roleTags?.map((tag) => tag.toLowerCase()) || []
    );
    const targetRoleTags = targetMember.teamMemberRoles.flatMap(
      (role) => role.roleTags?.map((tag) => tag.toLowerCase()) || []
    );

    const matchedRoles = memberRoles.filter((role) => targetRoles.includes(role));
    const matchedTags = memberRoleTags.filter((tag) => targetRoleTags.includes(tag));

    return [...new Set([...matchedRoles, ...matchedTags])];
  }

  private getMatchedIndustryTags(member: MemberWithRelations, targetMember: MemberWithRelations): string[] {
    const targetIndustryTags = targetMember.teamMemberRoles
      .flatMap((role) => role.team.industryTags)
      .map((tag) => tag.title.toLowerCase());

    const memberIndustryTags = member.teamMemberRoles
      .flatMap((role) => role.team.industryTags)
      .map((tag) => tag.title.toLowerCase());

    return [...new Set(targetIndustryTags.filter((tag) => memberIndustryTags.includes(tag)))];
  }
}
