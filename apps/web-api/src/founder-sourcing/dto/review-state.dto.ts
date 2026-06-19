export type ReviewChannel = 'lead-decision' | 'record-quality' | 'platform';

export interface ReviewStateDto {
  profile_id: string;
  status: 'new' | 'in-review' | 'approved' | 'rejected' | 'hold';
  feedback?: 'good' | 'bad' | 'wrong-fund' | 'needs-context';
  channel?: ReviewChannel;
  field?: string;
  area?: string;
  decided_at?: string;
  note?: string;
}

export interface ReviewStateExportResponseDto {
  items: ReviewStateDto[];
}
