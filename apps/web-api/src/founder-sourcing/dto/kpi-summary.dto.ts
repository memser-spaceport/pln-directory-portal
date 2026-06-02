export interface FounderKpiSummaryDto {
  newRecordsByFund: Record<string, number>;
  alignmentDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  sourceCoverage: Record<string, number>;
  weeklyNewRecords: Array<{
    weekStart: string;
    count: number;
  }>;
}
