export class ReviewMemberApprovalDto {
  state: 'APPROVED' | 'VERIFIED' | 'REJECTED' | 'PENDING';
  reason?: string;
}
