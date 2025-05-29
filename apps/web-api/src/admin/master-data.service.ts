import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { 
  CreateIndustryTagDto,
  UpdateIndustryTagDto,
  CreateSkillDto,
  UpdateSkillDto,
  CreateMembershipSourceDto,
  UpdateMembershipSourceDto,
  CreateTechnologyDto,
  UpdateTechnologyDto,
  CreateFocusAreaDto,
  UpdateFocusAreaDto
} from 'libs/contracts/src/schema';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LogService
  ) {}

  // Industry Tags CRUD
  async getIndustryTags() {
    try {
      return await this.prisma.industryTag.findMany({
        orderBy: { title: 'asc' },
        include: {
          industryCategory: true
        }
      });
    } catch (error) {
      this.logger.error('Error fetching industry tags', error);
      throw error;
    }
  }

  async createIndustryTag(createDto: CreateIndustryTagDto) {
    try {
      return await this.prisma.industryTag.create({
        data: createDto,
        include: {
          industryCategory: true
        }
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Industry tag with this title already exists');
      }
      this.logger.error('Error creating industry tag', error);
      throw error;
    }
  }

  async updateIndustryTag(uid: string, updateDto: UpdateIndustryTagDto) {
    try {
      const existingTag = await this.prisma.industryTag.findUnique({
        where: { uid }
      });

      if (!existingTag) {
        throw new NotFoundException('Industry tag not found');
      }

      return await this.prisma.industryTag.update({
        where: { uid },
        data: updateDto,
        include: {
          industryCategory: true
        }
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Industry tag with this title already exists');
      }
      this.logger.error('Error updating industry tag', error);
      throw error;
    }
  }

  async deleteIndustryTag(uid: string) {
    try {
      const existingTag = await this.prisma.industryTag.findUnique({
        where: { uid }
      });

      if (!existingTag) {
        throw new NotFoundException('Industry tag not found');
      }

      await this.prisma.industryTag.delete({
        where: { uid }
      });

      return { message: 'Industry tag deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting industry tag', error);
      throw error;
    }
  }

  // Skills CRUD
  async getSkills() {
    try {
      return await this.prisma.skill.findMany({
        orderBy: { title: 'asc' }
      });
    } catch (error) {
      this.logger.error('Error fetching skills', error);
      throw error;
    }
  }

  async createSkill(createDto: CreateSkillDto) {
    try {
      return await this.prisma.skill.create({
        data: createDto
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Skill with this title already exists');
      }
      this.logger.error('Error creating skill', error);
      throw error;
    }
  }

  async updateSkill(uid: string, updateDto: UpdateSkillDto) {
    try {
      const existingSkill = await this.prisma.skill.findUnique({
        where: { uid }
      });

      if (!existingSkill) {
        throw new NotFoundException('Skill not found');
      }

      return await this.prisma.skill.update({
        where: { uid },
        data: updateDto
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Skill with this title already exists');
      }
      this.logger.error('Error updating skill', error);
      throw error;
    }
  }

  async deleteSkill(uid: string) {
    try {
      const existingSkill = await this.prisma.skill.findUnique({
        where: { uid }
      });

      if (!existingSkill) {
        throw new NotFoundException('Skill not found');
      }

      await this.prisma.skill.delete({
        where: { uid }
      });

      return { message: 'Skill deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting skill', error);
      throw error;
    }
  }

  // Membership Sources CRUD
  async getMembershipSources() {
    try {
      return await this.prisma.membershipSource.findMany({
        orderBy: { title: 'asc' }
      });
    } catch (error) {
      this.logger.error('Error fetching membership sources', error);
      throw error;
    }
  }

  async createMembershipSource(createDto: CreateMembershipSourceDto) {
    try {
      return await this.prisma.membershipSource.create({
        data: createDto
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Membership source with this title already exists');
      }
      this.logger.error('Error creating membership source', error);
      throw error;
    }
  }

  async updateMembershipSource(uid: string, updateDto: UpdateMembershipSourceDto) {
    try {
      const existingSource = await this.prisma.membershipSource.findUnique({
        where: { uid }
      });

      if (!existingSource) {
        throw new NotFoundException('Membership source not found');
      }

      return await this.prisma.membershipSource.update({
        where: { uid },
        data: updateDto
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Membership source with this title already exists');
      }
      this.logger.error('Error updating membership source', error);
      throw error;
    }
  }

  async deleteMembershipSource(uid: string) {
    try {
      const existingSource = await this.prisma.membershipSource.findUnique({
        where: { uid }
      });

      if (!existingSource) {
        throw new NotFoundException('Membership source not found');
      }

      await this.prisma.membershipSource.delete({
        where: { uid }
      });

      return { message: 'Membership source deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting membership source', error);
      throw error;
    }
  }

  // Technologies CRUD
  async getTechnologies() {
    try {
      return await this.prisma.technology.findMany({
        orderBy: { title: 'asc' }
      });
    } catch (error) {
      this.logger.error('Error fetching technologies', error);
      throw error;
    }
  }

  async createTechnology(createDto: CreateTechnologyDto) {
    try {
      return await this.prisma.technology.create({
        data: createDto
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Technology with this title already exists');
      }
      this.logger.error('Error creating technology', error);
      throw error;
    }
  }

  async updateTechnology(uid: string, updateDto: UpdateTechnologyDto) {
    try {
      const existingTechnology = await this.prisma.technology.findUnique({
        where: { uid }
      });

      if (!existingTechnology) {
        throw new NotFoundException('Technology not found');
      }

      return await this.prisma.technology.update({
        where: { uid },
        data: updateDto
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Technology with this title already exists');
      }
      this.logger.error('Error updating technology', error);
      throw error;
    }
  }

  async deleteTechnology(uid: string) {
    try {
      const existingTechnology = await this.prisma.technology.findUnique({
        where: { uid }
      });

      if (!existingTechnology) {
        throw new NotFoundException('Technology not found');
      }

      await this.prisma.technology.delete({
        where: { uid }
      });

      return { message: 'Technology deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting technology', error);
      throw error;
    }
  }

  // Focus Areas CRUD
  async getFocusAreas() {
    try {
      return await this.prisma.focusArea.findMany({
        orderBy: { title: 'asc' },
        include: {
          parent: true,
          children: true
        }
      });
    } catch (error) {
      this.logger.error('Error fetching focus areas', error);
      throw error;
    }
  }

  async createFocusArea(createDto: CreateFocusAreaDto) {
    try {
      return await this.prisma.focusArea.create({
        data: createDto,
        include: {
          parent: true,
          children: true
        }
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Focus area with this title already exists');
      }
      this.logger.error('Error creating focus area', error);
      throw error;
    }
  }

  async updateFocusArea(uid: string, updateDto: UpdateFocusAreaDto) {
    try {
      const existingFocusArea = await this.prisma.focusArea.findUnique({
        where: { uid }
      });

      if (!existingFocusArea) {
        throw new NotFoundException('Focus area not found');
      }

      return await this.prisma.focusArea.update({
        where: { uid },
        data: updateDto,
        include: {
          parent: true,
          children: true
        }
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Focus area with this title already exists');
      }
      this.logger.error('Error updating focus area', error);
      throw error;
    }
  }

  async deleteFocusArea(uid: string) {
    try {
      const existingFocusArea = await this.prisma.focusArea.findUnique({
        where: { uid }
      });

      if (!existingFocusArea) {
        throw new NotFoundException('Focus area not found');
      }

      await this.prisma.focusArea.delete({
        where: { uid }
      });

      return { message: 'Focus area deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting focus area', error);
      throw error;
    }
  }
}