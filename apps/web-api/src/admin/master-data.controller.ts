import { 
  Body, 
  Controller, 
  Delete, 
  Get, 
  Param, 
  Post, 
  Put, 
  UseGuards, 
  UsePipes 
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { MasterDataService } from './master-data.service';
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

@Controller('v1/admin/master-data')
@UseGuards(AdminAuthGuard)
export class AdminMasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  // Industry Tags CRUD
  @Get('industry-tags')
  async getIndustryTags() {
    return await this.masterDataService.getIndustryTags();
  }

  @Post('industry-tags')
  @UsePipes(ZodValidationPipe)
  async createIndustryTag(@Body() createDto: CreateIndustryTagDto) {
    return await this.masterDataService.createIndustryTag(createDto);
  }

  @Put('industry-tags/:uid')
  @UsePipes(ZodValidationPipe)
  async updateIndustryTag(
    @Param('uid') uid: string,
    @Body() updateDto: UpdateIndustryTagDto
  ) {
    return await this.masterDataService.updateIndustryTag(uid, updateDto);
  }

  @Delete('industry-tags/:uid')
  async deleteIndustryTag(@Param('uid') uid: string) {
    return await this.masterDataService.deleteIndustryTag(uid);
  }

  // Skills CRUD
  @Get('skills')
  async getSkills() {
    return await this.masterDataService.getSkills();
  }

  @Post('skills')
  @UsePipes(ZodValidationPipe)
  async createSkill(@Body() createDto: CreateSkillDto) {
    return await this.masterDataService.createSkill(createDto);
  }

  @Put('skills/:uid')
  @UsePipes(ZodValidationPipe)
  async updateSkill(
    @Param('uid') uid: string,
    @Body() updateDto: UpdateSkillDto
  ) {
    return await this.masterDataService.updateSkill(uid, updateDto);
  }

  @Delete('skills/:uid')
  async deleteSkill(@Param('uid') uid: string) {
    return await this.masterDataService.deleteSkill(uid);
  }

  // Membership Sources CRUD
  @Get('membership-sources')
  async getMembershipSources() {
    return await this.masterDataService.getMembershipSources();
  }

  @Post('membership-sources')
  @UsePipes(ZodValidationPipe)
  async createMembershipSource(@Body() createDto: CreateMembershipSourceDto) {
    return await this.masterDataService.createMembershipSource(createDto);
  }

  @Put('membership-sources/:uid')
  @UsePipes(ZodValidationPipe)
  async updateMembershipSource(
    @Param('uid') uid: string,
    @Body() updateDto: UpdateMembershipSourceDto
  ) {
    return await this.masterDataService.updateMembershipSource(uid, updateDto);
  }

  @Delete('membership-sources/:uid')
  async deleteMembershipSource(@Param('uid') uid: string) {
    return await this.masterDataService.deleteMembershipSource(uid);
  }

  // Technologies CRUD
  @Get('technologies')
  async getTechnologies() {
    return await this.masterDataService.getTechnologies();
  }

  @Post('technologies')
  @UsePipes(ZodValidationPipe)
  async createTechnology(@Body() createDto: CreateTechnologyDto) {
    return await this.masterDataService.createTechnology(createDto);
  }

  @Put('technologies/:uid')
  @UsePipes(ZodValidationPipe)
  async updateTechnology(
    @Param('uid') uid: string,
    @Body() updateDto: UpdateTechnologyDto
  ) {
    return await this.masterDataService.updateTechnology(uid, updateDto);
  }

  @Delete('technologies/:uid')
  async deleteTechnology(@Param('uid') uid: string) {
    return await this.masterDataService.deleteTechnology(uid);
  }

  // Focus Areas CRUD
  @Get('focus-areas')
  async getFocusAreas() {
    return await this.masterDataService.getFocusAreas();
  }

  @Post('focus-areas')
  @UsePipes(ZodValidationPipe)
  async createFocusArea(@Body() createDto: CreateFocusAreaDto) {
    return await this.masterDataService.createFocusArea(createDto);
  }

  @Put('focus-areas/:uid')
  @UsePipes(ZodValidationPipe)
  async updateFocusArea(
    @Param('uid') uid: string,
    @Body() updateDto: UpdateFocusAreaDto
  ) {
    return await this.masterDataService.updateFocusArea(uid, updateDto);
  }

  @Delete('focus-areas/:uid')
  async deleteFocusArea(@Param('uid') uid: string) {
    return await this.masterDataService.deleteFocusArea(uid);
  }
}