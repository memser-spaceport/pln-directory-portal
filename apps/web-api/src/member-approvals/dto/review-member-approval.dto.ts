export class ReviewMemberApprovalDto {
  state: 'APPROVED' | 'REJECTED' | 'PENDING';
  reason?: string;
}
