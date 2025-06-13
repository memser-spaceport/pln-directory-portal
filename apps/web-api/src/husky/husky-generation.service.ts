import { Injectable, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { generateText, LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';

import { HUSKY_AUTO_BIO_SYSTEM_PROMPT, HUSKY_SKILLS_GENERATION_SYSTEM_PROMPT } from '../utils/ai-prompts';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class HuskyGenerationService {
  constructor(private logger: LogService, private prisma: PrismaService) {}

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

    const prompt = `
      Database Profile:
      - Name: ${member.name}
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

    const { text: bio } = await generateText({
      model: openai.responses(process.env.OPENAI_LLM_MODEL || '') as LanguageModel,
      system: HUSKY_AUTO_BIO_SYSTEM_PROMPT,
      prompt,
      tools: {
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: 'high',
          userLocation:
            member.location?.city && member.location?.country
              ? {
                  type: 'approximate',
                  city: member.location.city,
                  country: member.location.country,
                }
              : undefined,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'web_search_preview' },
      temperature: 0.7,
    });

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

    // Get all available skills from the database
    const availableSkills = await this.prisma.skill.findMany({
      select: { title: true, uid: true },
    });

    const prompt = `
      Database Profile:
      - Name: ${member.name}
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

    const { text: skillsText } = await generateText({
      model: openai.responses(process.env.OPENAI_LLM_MODEL || '') as LanguageModel,
      system: HUSKY_SKILLS_GENERATION_SYSTEM_PROMPT.replace(
        '{{availableSkills}}',
        JSON.stringify(availableSkills.map((s) => s.title))
      ),
      prompt,
      tools: {
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: 'high',
          userLocation:
            member.location?.city && member.location?.country
              ? {
                  type: 'approximate',
                  city: member.location.city,
                  country: member.location.country,
                }
              : undefined,
        }),
      },
      toolChoice: { type: 'tool', toolName: 'web_search_preview' },
      temperature: 0.7,
    });

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
}
