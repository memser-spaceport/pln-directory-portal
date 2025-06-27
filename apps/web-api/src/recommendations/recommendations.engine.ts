import {
  Member,
  TeamMemberRole,
  MemberInteraction,
  PLEventGuest,
  Team,
  TeamFocusArea,
  MemberExperience,
  NotificationSetting,
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
  MATCHING_KEYWORD: 10,
  HAS_OFFICE_HOURS: 1,
  NO_OFFICE_HOURS: 0,
  JOIN_DATE: {
    LESS_THAN_1_MONTH: 3,
    LESS_THAN_3_MONTHS: 2,
    LESS_THAN_6_MONTHS: 1,
    MORE_THAN_6_MONTHS: 0,
  },
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
  includeIndustryTags?: boolean;
  includeTechnologies?: boolean;
  includeKeywords?: boolean;
  includeSameEvent?: boolean;

  minScore?: number;
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
      shortDescription?: string;
      longDescription?: string;
      asks: { title: string; description: string }[];
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
  teamKeyword: number;
  hasOfficeHours: number;
  joinDateScore: number;
  matchedFocusAreas: string[];
  matchedTechnologies: string[];
  matchedFundingStages: string[];
  matchedRoles: string[];
  matchedIndustryTags: string[];
  matchedKeywords: string[];
}

export class RecommendationsEngine {
  public getRecommendations(
    targetMember: MemberWithRelations,
    allMembers: MemberWithRelations[],
    config: RecommendationConfig,
    notificationSetting?: NotificationSetting
  ): RecommendationScore[] {
    // Filter out target member, members that are in the skip list and members without teams
    let filteredMembers = allMembers.filter(
      (m) =>
        m.uid !== targetMember.uid &&
        !config.skipMemberIds?.includes(m.uid) &&
        !config.skipMemberNames?.includes(m.name) &&
        m.teamMemberRoles.length > 0
    );

    // Filter out members that are in the team skip list
    if (config.skipTeamNames?.length) {
      filteredMembers = filteredMembers.filter(
        (member) =>
          !member.experiences.some((experience) =>
            config.skipTeamNames?.some((skipName) => experience.company.toLowerCase().includes(skipName.toLowerCase()))
          ) &&
          !member.teamMemberRoles.some((role) =>
            config.skipTeamNames?.some((skipName) => role.team?.name?.toLowerCase().includes(skipName.toLowerCase()))
          )
      );
    }

    // Filter out members that are in teams with matching industry tags
    if (config.skipIndustryTags?.length) {
      filteredMembers = filteredMembers.filter(
        (member) =>
          !member.teamMemberRoles.some((role) =>
            role.team?.industryTags?.some((tag) =>
              config.skipIndustryTags?.some((skipTag) => tag.title.toLowerCase().includes(skipTag.toLowerCase()))
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
      this.calculateRecommendationScore(member, targetMember, config, notificationSetting)
    );

    return scoredMembers.filter((member) => member.score >= (config.minScore ?? 15)).sort((a, b) => b.score - a.score);
  }

  public calculateRecommendationScore(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    config: RecommendationConfig,
    notificationSetting?: NotificationSetting
  ): RecommendationScore {
    const settings = this.getNotificationSettings(notificationSetting);
    const matchedItems = this.getMatchedItems(member, targetMember, settings);
    const factors = this.calculateFactors(member, targetMember, config, settings, matchedItems);
    const score = this.calculateTotalScore(factors);

    return {
      member,
      score,
      factors,
    };
  }

  private getNotificationSettings(notificationSetting?: NotificationSetting) {
    return {
      byFocusArea: notificationSetting?.byFocusArea ?? true,
      byRole: notificationSetting?.byRole ?? true,
      byFundingStage: notificationSetting?.byFundingStage ?? true,
      byIndustryTag: notificationSetting?.byIndustryTag ?? true,
      byTechnology: notificationSetting?.byTechnology ?? true,
      byKeyword: notificationSetting?.byKeyword ?? true,
      focusAreaList: notificationSetting?.focusAreaList ?? [],
      roleList: notificationSetting?.roleList ?? [],
      fundingStageList: notificationSetting?.fundingStageList ?? [],
      industryTagList: notificationSetting?.industryTagList ?? [],
      technologyList: notificationSetting?.technologyList ?? [],
      keywordList: notificationSetting?.keywordList ?? [],
    };
  }

  private getMatchedItems(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    settings: ReturnType<typeof this.getNotificationSettings>
  ) {
    return {
      matchedFocusAreas: settings.byFocusArea
        ? this.getMatchedFocusAreas(member, targetMember, settings.focusAreaList)
        : [],
      matchedTechnologies: settings.byTechnology
        ? this.getMatchedTechnologies(member, targetMember, settings.technologyList)
        : [],
      matchedFundingStages: settings.byFundingStage
        ? this.getMatchedFundingStages(member, targetMember, settings.fundingStageList)
        : [],
      matchedRoles: settings.byRole ? this.getMatchedRoles(member, targetMember, settings.roleList) : [],
      matchedIndustryTags: settings.byIndustryTag
        ? this.getMatchedIndustryTags(member, targetMember, settings.industryTagList)
        : [],
      matchedKeywords: settings.byKeyword ? this.getMatchedKeywords(member, targetMember, settings.keywordList) : [],
    };
  }

  private calculateFactors(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    config: RecommendationConfig,
    settings: ReturnType<typeof this.getNotificationSettings>,
    matchedItems: ReturnType<typeof this.getMatchedItems>
  ): RecommendationFactors {
    return {
      sameTeam: this.calculateSameTeamScore(member, targetMember),
      previouslyRecommended: this.calculatePreviouslyRecommendedScore(member, targetMember),
      bookedOH: this.calculateBookedOHScore(member, targetMember),
      sameEvent: this.calculateSameEventScore(member, targetMember),
      teamFocusArea: this.calculateTeamFocusAreaScore(config, settings, matchedItems),
      teamFundingStage: this.calculateTeamFundingStageScore(config, settings, matchedItems),
      roleMatch: this.calculateRoleMatchScore(member.teamMemberRoles, targetMember.teamMemberRoles, settings.roleList),
      teamTechnology: this.calculateTeamTechnologyScore(config, settings, matchedItems),
      teamIndustryTag: this.calculateTeamIndustryTagScore(config, settings, matchedItems),
      teamKeyword: this.calculateTeamKeywordScore(config, settings, matchedItems),
      hasOfficeHours: this.calculateHasOfficeHoursScore(member),
      joinDateScore: this.calculateJoinDateScore(member.plnStartDate),
      matchedFocusAreas: matchedItems.matchedFocusAreas,
      matchedTechnologies: matchedItems.matchedTechnologies,
      matchedFundingStages: matchedItems.matchedFundingStages,
      matchedRoles: matchedItems.matchedRoles,
      matchedIndustryTags: matchedItems.matchedIndustryTags,
      matchedKeywords: matchedItems.matchedKeywords,
    };
  }

  private calculateTotalScore(factors: RecommendationFactors): number {
    return (
      factors.sameTeam *
      factors.previouslyRecommended *
      factors.bookedOH *
      factors.sameEvent *
      (factors.teamFocusArea +
        factors.teamFundingStage +
        factors.roleMatch +
        factors.teamTechnology +
        factors.teamIndustryTag +
        factors.teamKeyword +
        factors.hasOfficeHours +
        factors.joinDateScore)
    );
  }

  private calculateSameTeamScore(member: MemberWithRelations, targetMember: MemberWithRelations): number {
    const hasSameTeam = member.teamMemberRoles.some((role) =>
      targetMember.teamMemberRoles.some((targetRole) => role.teamUid === targetRole.teamUid)
    );
    return hasSameTeam ? SCORES.SAME_TEAM : SCORES.DIFFERENT_TEAM;
  }

  private calculatePreviouslyRecommendedScore(member: MemberWithRelations, targetMember: MemberWithRelations): number {
    const hasBookedOH = this.hasBookedOH(member, targetMember);
    return hasBookedOH ? SCORES.PREVIOUSLY_RECOMMENDED : SCORES.NOT_PREVIOUSLY_RECOMMENDED;
  }

  private calculateBookedOHScore(member: MemberWithRelations, targetMember: MemberWithRelations): number {
    const hasBookedOH = member.interactions.some(
      (interaction) => interaction.targetMemberUid === targetMember.uid && interaction.type === 'OFFICE_HOURS'
    );
    return hasBookedOH ? SCORES.BOOKED_OH : SCORES.NOT_BOOKED_OH;
  }

  private calculateSameEventScore(member: MemberWithRelations, targetMember: MemberWithRelations): number {
    const hasSameEvent = this.hasSameEvent(member, targetMember);
    return hasSameEvent ? SCORES.SAME_EVENT : SCORES.DIFFERENT_EVENT;
  }

  private calculateTeamFocusAreaScore(
    config: RecommendationConfig,
    settings: ReturnType<typeof this.getNotificationSettings>,
    matchedItems: ReturnType<typeof this.getMatchedItems>
  ): number {
    if (!config.includeFocusAreas || !settings.byFocusArea) {
      return 0;
    }
    return matchedItems.matchedFocusAreas.length > 0 ? SCORES.MATCHING_FOCUS_AREA : 0;
  }

  private calculateTeamFundingStageScore(
    config: RecommendationConfig,
    settings: ReturnType<typeof this.getNotificationSettings>,
    matchedItems: ReturnType<typeof this.getMatchedItems>
  ): number {
    if (!config.includeFundingStages || !settings.byFundingStage) {
      return 0;
    }
    return matchedItems.matchedFundingStages.length > 0 ? SCORES.MATCHING_FUNDING_STAGE : 0;
  }

  private calculateTeamTechnologyScore(
    config: RecommendationConfig,
    settings: ReturnType<typeof this.getNotificationSettings>,
    matchedItems: ReturnType<typeof this.getMatchedItems>
  ): number {
    if (!config.includeTechnologies || !settings.byTechnology) {
      return 0;
    }
    return matchedItems.matchedTechnologies.length > 0 ? SCORES.MATCHING_TECHNOLOGY : 0;
  }

  private calculateTeamIndustryTagScore(
    config: RecommendationConfig,
    settings: ReturnType<typeof this.getNotificationSettings>,
    matchedItems: ReturnType<typeof this.getMatchedItems>
  ): number {
    if (!config.includeIndustryTags || !settings.byIndustryTag) {
      return 0;
    }
    return matchedItems.matchedIndustryTags.length > 0 ? SCORES.MATCHING_INDUSTRY_TAG : 0;
  }

  private calculateTeamKeywordScore(
    config: RecommendationConfig,
    settings: ReturnType<typeof this.getNotificationSettings>,
    matchedItems: ReturnType<typeof this.getMatchedItems>
  ): number {
    if (!config.includeKeywords || !settings.byKeyword) {
      return 0;
    }
    return matchedItems.matchedKeywords.length > 0 ? SCORES.MATCHING_KEYWORD * matchedItems.matchedKeywords.length : 0;
  }

  private calculateHasOfficeHoursScore(member: MemberWithRelations): number {
    return member.officeHours ? SCORES.HAS_OFFICE_HOURS : SCORES.NO_OFFICE_HOURS;
  }

  private calculateRoleMatchScore(
    memberRoles: TeamMemberRole[],
    targetRoles: TeamMemberRole[],
    roleList: string[]
  ): number {
    if (!memberRoles.length || !targetRoles.length) return SCORES.NO_OFFICE_HOURS;

    const matchedRoles = this.getMatchedRoles(
      { teamMemberRoles: memberRoles } as MemberWithRelations,
      { teamMemberRoles: targetRoles } as MemberWithRelations,
      roleList
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

  private getMatchedFocusAreas(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    focusAreaList: string[]
  ): string[] {
    const targetFocusAreas =
      focusAreaList.length > 0
        ? focusAreaList.map((area) => area.toLowerCase())
        : targetMember.teamMemberRoles
            .flatMap((role) => role.team.teamFocusAreas)
            .map((focusArea) => focusArea.focusArea.title.toLowerCase());

    const memberFocusAreas = member.teamMemberRoles
      .flatMap((role) => role.team.teamFocusAreas)
      .map((focusArea) => focusArea.focusArea.title.toLowerCase());

    return [...new Set(targetFocusAreas.filter((area) => memberFocusAreas.includes(area)))];
  }

  private getMatchedTechnologies(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    technologyList: string[]
  ): string[] {
    const targetTechnologies =
      technologyList.length > 0
        ? technologyList.map((tech) => tech.toLowerCase())
        : targetMember.teamMemberRoles
            .flatMap((role) => role.team.technologies)
            .map((tech) => tech.title.toLowerCase());

    const memberTechnologies = member.teamMemberRoles
      .flatMap((role) => role.team.technologies)
      .map((tech) => tech.title.toLowerCase());

    return [...new Set(targetTechnologies.filter((tech) => memberTechnologies.includes(tech)))];
  }

  private getMatchedFundingStages(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    fundingStageList: string[]
  ): string[] {
    const targetFundingStages =
      fundingStageList.length > 0
        ? fundingStageList.map((stage) => stage.toLowerCase())
        : (targetMember.teamMemberRoles
            .map((role) => role.team.fundingStage?.title.toLowerCase())
            .filter(Boolean) as string[]);

    const memberFundingStages = member.teamMemberRoles
      .map((role) => role.team.fundingStage?.title)
      .filter(Boolean) as string[];

    return [...new Set(targetFundingStages.filter((stage) => memberFundingStages.includes(stage)))];
  }

  private getMatchedRoles(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    roleList: string[]
  ): string[] {
    const targetRoles =
      roleList.length > 0
        ? roleList.map((role) => role.toLowerCase())
        : (targetMember.teamMemberRoles.map((role) => role.role?.toLowerCase()).filter(Boolean) as string[]);

    const memberRoles = member.teamMemberRoles.map((role) => role.role?.toLowerCase()).filter(Boolean) as string[];

    const memberRoleTags = member.teamMemberRoles.flatMap(
      (role) => role.roleTags?.map((tag) => tag.toLowerCase()) || []
    );
    const targetRoleTags = targetMember.teamMemberRoles.flatMap(
      (role) => role.roleTags?.map((tag) => tag.toLowerCase()) || []
    );

    const matchedRoles = memberRoles.filter((role) => targetRoles.includes(role));
    const matchedTags = memberRoleTags.filter((tag) => targetRoleTags.includes(tag) || targetRoles.includes(tag));

    return [...new Set([...matchedRoles, ...matchedTags])];
  }

  private getMatchedIndustryTags(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    industryTagList: string[]
  ): string[] {
    const targetIndustryTags =
      industryTagList.length > 0
        ? industryTagList.map((tag) => tag.toLowerCase())
        : (targetMember.teamMemberRoles
            .flatMap((role) => role.team.industryTags)
            .map((tag) => tag.title.toLowerCase()) as string[]);

    const memberIndustryTags = member.teamMemberRoles
      .flatMap((role) => role.team.industryTags)
      .map((tag) => tag.title.toLowerCase());

    return [...new Set(targetIndustryTags.filter((tag) => memberIndustryTags.includes(tag)))];
  }

  private getMatchedKeywords(
    member: MemberWithRelations,
    targetMember: MemberWithRelations,
    keywordList: string[]
  ): string[] {
    if (keywordList.length === 0) return [];

    const matchedKeywords: string[] = [];
    const lowerCaseKeywords = keywordList.map((keyword) => keyword.toLowerCase());

    // Search in member bio
    if (member.bio) {
      const memberBioLower = member.bio.toLowerCase();
      lowerCaseKeywords.forEach((keyword) => {
        if (memberBioLower.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      });
    }

    // Search in member experiences
    member.experiences.forEach((experience) => {
      const experienceText = [experience.title, experience.company, experience.description, experience.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      lowerCaseKeywords.forEach((keyword) => {
        if (experienceText.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      });
    });

    // Search in team descriptions, asks, and industry tags
    member.teamMemberRoles.forEach((role) => {
      const team = role.team;
      const teamText = [
        team.shortDescription,
        team.longDescription,
        ...team.asks.map((ask) => `${ask.title} ${ask.description}`),
        ...team.industryTags.map((tag) => tag.title),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      lowerCaseKeywords.forEach((keyword) => {
        if (teamText.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      });
    });

    return [...new Set(matchedKeywords)];
  }
}
