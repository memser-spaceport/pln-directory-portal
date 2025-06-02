import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { RecommendationsEngine, MemberWithRelations } from './recommendations.engine';

@Injectable()
export class RecommendationsService {
  constructor(private prisma: PrismaService, private logger: LogService) {}

  public async test() {
    const testingNamesList = [
      'Erick Watson',
      'Diogo Coimbra',
      'Jonathan Victor',
      'David Casey',
      'Stefaan Vervaet',
      'Raghav Rmadya',
      'David Sneider',
      'Nuno Reis',
      'Max Giammario',
      'Jeremy Zaccherini',
    ];

    const chunkSize = 500;
    const engine = new RecommendationsEngine();

    try {
      // Load all members with required relations
      this.logger.info('Loading members in chunks...');
      const allMembers = await this.loadMembersInChunks(chunkSize);
      this.logger.info(`Loaded ${allMembers.length} members`);

      // Find test members by name
      const testMembers = testingNamesList.map((name) => allMembers.find((member) => member.name === name));

      if (testMembers.length === 0) {
        this.logger.error('No test members found');
        return;
      }

      this.logger.info(`Found ${testMembers.length} test members`);

      // Run recommendations for each test member
      for (const testMember of testMembers) {
        // this.logger.info(`\nGetting recommendations for ${testMember.name}:`);

        if (!testMember) {
          continue;
        }

        const recommendations = engine.getRecommendations(testMember, allMembers, {
          skipTeamIds: ['clz1ls1gr0003xl02n5lpvbhn', 'cldvnyxaf01ynu21k62uopjvg'],
          includeFocusAreas: true,
          includeRoles: true,
          includeFundingStages: true,
        });

        // Log recommendations in a human-readable format
        console.log(`\n${testMember.name}`);
        recommendations.forEach((rec, index) => {
          console.log(`\n${index + 1}. [${rec.member.name}](https://directory.plnetwork.io/members/${rec.member.uid})`);
          console.log(`\n   Role: ${rec.member.teamMemberRoles[0]?.role || 'No role'}`);
          console.log(`\n   Team: ${rec.member.teamMemberRoles[0]?.team.name || 'No team'}`);
          console.log(`\n   Score: ${rec.score}`);
          console.log('\n   Factors:');
          console.log(`   - Same Team: ${rec.factors.sameTeam === 1 ? 'No' : 'Yes'}`);
          console.log(`   - Previously Recommended: ${rec.factors.previouslyRecommended === 1 ? 'No' : 'Yes'}`);
          console.log(`   - Booked Office Hours: ${rec.factors.bookedOH === 1 ? 'No' : 'Yes'}`);
          console.log(`   - Same Event: ${rec.factors.sameEvent === 1 ? 'No' : 'Yes'}`);
          console.log(`   - Team Focus Area Match: ${rec.factors.teamFocusArea > 0 ? 'Yes' : 'No'}`);
          console.log(`   - Team Funding Stage Match: ${rec.factors.teamFundingStage > 0 ? 'Yes' : 'No'}`);
          console.log(`   - Role Match: ${rec.factors.roleMatch > 0 ? 'Yes' : 'No'}`);
          console.log(`   - Has Office Hours: ${rec.factors.hasOfficeHours === 1 ? 'No' : 'Yes'}`);
          console.log(`   - Join Date Score: ${rec.factors.joinDateScore}`);
        });

        if (recommendations.length === 0) {
          console.log('\nNo recommendations found with score > 15');
        }
        console.log('\n--------------------------------\n');
      }
    } catch (error) {
      this.logger.error('Error in test:', error);
    }
  }

  private async loadMembersInChunks(chunkSize: number): Promise<MemberWithRelations[]> {
    const allMembers: MemberWithRelations[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const members = await this.prisma.member.findMany({
        skip,
        take: chunkSize,
        include: {
          teamMemberRoles: {
            include: {
              team: {
                include: {
                  teamFocusAreas: {
                    include: {
                      focusArea: true,
                    },
                  },
                  fundingStage: true,
                },
              },
            },
          },
          interactions: true,
          targetInteractions: true,
          eventGuests: true,
        },
      });

      if (members.length === 0) {
        hasMore = false;
      } else {
        allMembers.push(...(members as unknown as MemberWithRelations[]));
        skip += chunkSize;
      }
    }

    return allMembers;
  }
}
