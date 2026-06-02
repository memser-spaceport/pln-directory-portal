export interface ReviewStateDto {
  profile_id: string;
  status: 'new' | 'in-review' | 'approved' | 'rejected' | 'hold';
  feedback?: 'good' | 'bad' | 'wrong-fund' | 'needs-context';
  decided_at?: string;
  note?: string;
}

export interface ReviewStateExportResponseDto {
  items: ReviewStateDto[];
}
