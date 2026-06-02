export class ReviewFounderDto {
  status!: 'new' | 'in-review' | 'approved' | 'rejected' | 'hold';
  feedback?: 'good' | 'bad' | 'wrong-fund' | 'needs-context';
  note?: string;
}
