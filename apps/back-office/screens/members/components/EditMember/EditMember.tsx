import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { MemberForm } from '../MemberForm/MemberForm';
import clsx from 'clsx';
import { EditIcon } from '../icons';
import { TMemberForm } from '../../types/member';
import { saveRegistrationImage } from '../../../../utils/services/member';

import s from './EditMember.module.scss';
import { useMember } from '../../../../hooks/members/useMember';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  className?: string;
  uid: string;
}

export const EditMember = ({ className, uid }: Props) => {
  const [open, setOpen] = useState(false);

  const handleSignUpClick = () => {
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const onSubmit = useCallback(async (formData: TMemberForm) => {
    let image;

    if (formData.image) {
      const imgResponse = await saveRegistrationImage(formData.image);

      image = imgResponse?.image.uid;
    }
  }, []);

  const { data, isLoading } = useMember(uid, open);

  return (
    <>
      <button className={clsx(s.root, className)} onClick={handleSignUpClick}>
        <EditIcon /> Edit
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="modal"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fade}
            transition={{ duration: 0.2 }}
            style={{ zIndex: 100, position: 'absolute' }}
          >
            <MemberForm
              onClose={handleClose}
              title="Edit Member"
              desc="Verify the information or change the member's information."
              onSubmit={onSubmit}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

function formatPayload(formData: TMemberForm) {
  return {
    name: formData.name,
    email: formData.email,
    plnStartDate: formData.joinDate,
    city: formData.city,
    region: formData.state,
    country: formData.country,
    teamOrProjectURL: formData.project,
    linkedinHandler: formData.linkedin,
    discordHandler: formData.discord,
    twitterHandler: formData.twitter,
    githubHandler: formData.github,
    telegramHandler: formData.telegram,
    officeHours: formData.officeHours,
    // moreDetails: memberInfo.moreDetails,
    // openToWork: memberInfo.openToWork,
    // plnFriend: memberInfo.plnFriend,
    // teamAndRoles: memberInfo.teamMemberRoles,
    // projectContributions: memberInfo.projectContributions?.map((contribution: any) => ({
    //   ...omit(contribution, 'projectName'),
    // })),
    skills: formData.skills?.map((skill: Record<string, string>) => ({
      title: skill.name,
      uid: skill.id,
    })),
    bio: formData.bio,
  };
}
