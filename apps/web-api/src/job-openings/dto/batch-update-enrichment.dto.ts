import { UpdateTeamEnrichmentDto } from 'libs/contracts/src/schema/team-job-enrichment';

export interface BatchUpdateEnrichmentDto {
  items: UpdateTeamEnrichmentDto[];
}
