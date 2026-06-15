export class ReviewFounderDto {
  status?: 'new' | 'in-review' | 'approved' | 'rejected' | 'hold';
  feedback?: 'good' | 'bad' | 'wrong-fund' | 'needs-context';
  channel?: 'lead-decision' | 'record-quality' | 'platform';
  field?: string;
  area?: string;
  note?: string;
}
