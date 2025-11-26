export type ParticipantsRequest = {
  id: number;
  uid: string;
  participantType: "MEMBER" | "TEAM";
  status: ApprovalStatus;
  oldData?: any;
  newData: any;
  referenceUid?: string;
  requesterEmailId: string;
  uniqueIdentifier: string;
  createdAt: Date;
  updatedAt: Date;
};

enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  AUTOAPPROVED = 'AUTOAPPROVED'
}
