import React from 'react';
import { UploadParticipantsModal } from '../demo-days/UploadParticipantsModal';

interface UploadTeamPitchInvestorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pitchUid: string;
}

export const UploadTeamPitchInvestorsModal: React.FC<UploadTeamPitchInvestorsModalProps> = ({
  isOpen,
  onClose,
  pitchUid,
}) => {
  return <UploadParticipantsModal isOpen={isOpen} onClose={onClose} pitchUid={pitchUid} />;
};
