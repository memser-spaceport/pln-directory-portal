import { Injectable, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { generateText, LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import * as countries from 'i18n-iso-countries';

import {
  HUSKY_AUTO_BIO_SYSTEM_PROMPT,
  HUSKY_SKILLS_GENERATION_SYSTEM_PROMPT,
  HUSKY_AUTO_BIO_DATABASE_ONLY_PROMPT,
  HUSKY_RECOMMENDATION_REASON_SYSTEM_PROMPT,
} from '../utils/ai-prompts';
import { PrismaService } from '../shared/prisma.service';
import { MemberWithRelations, RecommendationFactors } from '../recommendations/recommendations.engine';

@Injectable()
export class HuskyGenerationService {
  constructor(private logger: LogService, private prisma: PrismaService) {
    // Load country data for English
    import('i18n-iso-countries/langs/en.json').then((en) => {
      countries.registerLocale(en);
    });
  }

  async generateMemberBio(memberEmail: string): Promise<{ bio: string }> {
    this.logger.info(`Generating bio for member ${memberEmail}`);

    const member = await this.prisma.member.findUnique({
      where: {
        email: memberEmail,
      },
      include: {
        skills: true,
        teamMemberRoles: {
          include: {
            team: true,
          },
        },
        projectContributions: {
          include: {
            project: true,
          },
        },
        experiences: true,
        location: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Check if we have enough identifying information to safely use web search
    const hasEnoughIdentifyingInfo = this.hasEnoughIdentifyingInfo(member);

    const prompt = `
      Profile:
      - Name: ${member.name}
      - Email: ${member.email || ''}
      - GitHub: ${member.githubHandler || ''}
      - LinkedIn: ${member.linkedinHandler || ''}
      - Twitter: ${member.twitterHandler || ''}
      - Discord: ${member.discordHandler || ''}
      - Telegram: ${member.telegramHandler || ''}
      - Location: ${member.location ? `${member.location.city || ''}, ${member.location.country || ''}` : ''}
      - Skills: ${member.skills?.map((skill) => skill.title).join(', ') || ''}
      - Team Roles: ${member.teamMemberRoles
        .map((role) => `${role.role} at ${role.team.name}${role.teamLead ? ' (Team Lead)' : ''}`)
        .join(', ')}
      - Project Contributions: ${member.projectContributions
        .map(
          (contribution) =>
            `${contribution.role || 'Contributor'} for ${contribution.project?.name || 'Unknown Project'}`
        )
        .join(', ')}
      - Professional Experience: ${member.experiences
        .map(
          (exp) =>
            `${exp.title} at ${exp.company}${exp.location ? ` in ${exp.location}` : ''} (${exp.startDate} - ${
              exp.endDate || 'Present'
            })`
        )
        .join('\n')}
      - Additional Details: ${member.moreDetails || ''}
      - LinkedIn Details: ${member.linkedInDetails ? JSON.stringify(member.linkedInDetails) : ''}
    `;

    const generateTextOptions: any = {
      model: openai.responses(process.env.OPENAI_LLM_MODEL || '') as LanguageModel,
      prompt,
      temperature: 0.7,
    };

    if (hasEnoughIdentifyingInfo) {
      // Use web search with strict verification
      generateTextOptions.system = HUSKY_AUTO_BIO_SYSTEM_PROMPT;
      generateTextOptions.tools = this.buildUserLocation(member);
      generateTextOptions.toolChoice = { type: 'tool', toolName: 'web_search_preview' };
    } else {
      // Use database-only prompt without web search
      generateTextOptions.system = HUSKY_AUTO_BIO_DATABASE_ONLY_PROMPT;
    }

    const { text: bio } = await generateText(generateTextOptions);

    return { bio };
  }

  async generateMemberSkills(memberEmail: string): Promise<{ skills: { title: string; uid: string }[] }> {
    this.logger.info(`Generating skills for member ${memberEmail}`);

    const member = await this.prisma.member.findUnique({
      where: {
        email: memberEmail,
      },
      include: {
        skills: true,
        teamMemberRoles: {
          include: {
            team: true,
          },
        },
        projectContributions: {
          include: {
            project: true,
          },
        },
        experiences: true,
        location: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Check if we have enough identifying information to safely use web search
    const hasEnoughIdentifyingInfo = this.hasEnoughIdentifyingInfo(member);

    // Get all available skills from the database
    const availableSkills = await this.prisma.skill.findMany({
      select: { title: true, uid: true },
    });

    const prompt = `
      Profile:
      - Name: ${member.name}
      - Email: ${member.email || ''}
      - GitHub: ${member.githubHandler || ''}
      - LinkedIn: ${member.linkedinHandler || ''}
      - Twitter: ${member.twitterHandler || ''}
      - Discord: ${member.discordHandler || ''}
      - Telegram: ${member.telegramHandler || ''}
      - Location: ${member.location ? `${member.location.city || ''}, ${member.location.country || ''}` : ''}
      - Current Skills: ${member.skills?.map((skill) => skill.title).join(', ') || ''}
      - Team Roles: ${member.teamMemberRoles
        .map((role) => `${role.role} at ${role.team.name}${role.teamLead ? ' (Team Lead)' : ''}`)
        .join(', ')}
      - Project Contributions: ${member.projectContributions
        .map(
          (contribution) =>
            `${contribution.role || 'Contributor'} for ${contribution.project?.name || 'Unknown Project'}`
        )
        .join(', ')}
      - Professional Experience: ${member.experiences
        .map(
          (exp) =>
            `${exp.title} at ${exp.company}${exp.location ? ` in ${exp.location}` : ''} (${exp.startDate} - ${
              exp.endDate || 'Present'
            })`
        )
        .join('\n')}
      - Additional Details: ${member.moreDetails || ''}
      - LinkedIn Details: ${member.linkedInDetails ? JSON.stringify(member.linkedInDetails) : ''}
    `;

    const generateTextOptions: any = {
      model: openai.responses(process.env.OPENAI_LLM_MODEL || '') as LanguageModel,
      system: HUSKY_SKILLS_GENERATION_SYSTEM_PROMPT.replace(
        '{{availableSkills}}',
        JSON.stringify(availableSkills.map((s) => s.title))
      ),
      prompt,
      temperature: 0.7,
    };

    if (hasEnoughIdentifyingInfo) {
      // Use web search with strict verification
      generateTextOptions.tools = this.buildUserLocation(member);
      generateTextOptions.toolChoice = { type: 'tool', toolName: 'web_search_preview' };
    }

    const { text: skillsText } = await generateText(generateTextOptions);

    // Parse the response as JSON array
    let skills: { title: string; uid: string }[] = [];
    try {
      const skillTitles = JSON.parse(skillsText);
      skills = availableSkills.filter((skill) =>
        skillTitles.some((title) => title.toLowerCase() === skill.title.toLowerCase())
      );
      // Filter out any skills that are already in the member's current skills
      const currentSkillTitles = member.skills.map((s) => s.title);
      skills = skills.filter((skill) => !currentSkillTitles.includes(skill.title));
    } catch (error) {
      this.logger.error(`Failed to parse skills response: ${skillsText}`);
      return { skills: [] };
    }

    return { skills };
  }

  async generateRecommendationReason(
    targetMember: MemberWithRelations,
    recommendedMember: MemberWithRelations,
    factors: RecommendationFactors
  ): Promise<string> {
    this.logger.info(`Generating recommendation reason for ${targetMember.name} and ${recommendedMember.name}`);

    const prompt = `
      Target Member:
      - Name: ${targetMember.name}
      - Team Roles: ${targetMember.teamMemberRoles
        .map((role) => `${role.role} at ${role.team.name}${role.teamLead ? ' (Team Lead)' : ''}`)
        .join(', ')}
      - Professional Experience: ${targetMember.experiences
        .map((exp) => `${exp.title} at ${exp.company} (${exp.startDate} - ${exp.endDate || 'Present'})`)
        .join(', ')}

      Recommended Member:
      - Name: ${recommendedMember.name}
      - Team Roles: ${recommendedMember.teamMemberRoles
        .map((role) => `${role.role} at ${role.team.name}${role.teamLead ? ' (Team Lead)' : ''}`)
        .join(', ')}
      - Professional Experience: ${recommendedMember.experiences
        .map((exp) => `${exp.title} at ${exp.company} (${exp.startDate} - ${exp.endDate || 'Present'})`)
        .join(', ')}

      Matching Factors:
      - Technologies: ${factors.matchedTechnologies?.join(', ') || 'None'}
      - Funding Stages: ${factors.matchedFundingStages?.join(', ') || 'None'}
      - Roles: ${factors.matchedRoles?.join(', ') || 'None'}
      - Keywords: ${factors.matchedKeywords?.join(', ') || 'None'}
    `;

    const generateTextOptions: any = {
      model: openai.responses(process.env.OPENAI_LLM_MODEL || '') as LanguageModel,
      system: HUSKY_RECOMMENDATION_REASON_SYSTEM_PROMPT,
      prompt,
      temperature: 0.7,
    };

    try {
      const { text: reason } = await generateText(generateTextOptions);
      return reason.trim();
    } catch (error) {
      this.logger.error(
        `Error generating recommendation reason for ${targetMember.name} and ${recommendedMember.name}: ${error}`
      );
      return 'Based on your profile and activity in the network';
    }
  }

  private hasEnoughIdentifyingInfo(member: any): boolean {
    // Check if we have enough unique identifying information
    const hasUniqueName = member.name && member.name.trim().length > 0;
    const hasSocialMedia = member.githubHandler || member.linkedinHandler || member.twitterHandler;
    const hasTeamInfo = member.teamMemberRoles && member.teamMemberRoles.length > 0;
    const hasLocation = member.location && (member.location.city || member.location.country);
    const hasExperience = member.experiences && member.experiences.length > 0;

    // Need at least 3 pieces of identifying information to safely use web search
    const identifyingFactors = [hasUniqueName, hasSocialMedia, hasTeamInfo, hasLocation, hasExperience].filter(Boolean);

    return identifyingFactors.length >= 3;
  }

  private buildUserLocation(member: any) {
    const countryCode = member.location?.country ? countries.getAlpha2Code(member.location.country, 'en') : null;
    return {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: 'high',
        userLocation:
          member.location?.city && countryCode
            ? {
                type: 'approximate',
                city: member.location.city,
                country: countryCode,
              }
            : member.location?.city
            ? {
                type: 'approximate',
                city: member.location.city,
              }
            : undefined,
      }),
    };
  }
}
