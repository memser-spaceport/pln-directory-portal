import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import s from './AddMember.module.scss';
import { MemberForm } from '../MemberForm/MemberForm';
import clsx from 'clsx';
import { PlusIcon } from '../icons';
import { TMemberForm } from '../../types/member';
import { saveRegistrationImage } from '../../../../utils/services/member';
import { useAddMember } from '../../../../hooks/members/useAddMember';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  className?: string;
}

export const AddMember = ({ className }: Props) => {
  const [open, setOpen] = useState(false);

  const handleSignUpClick = () => {
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const { mutateAsync } = useAddMember();

  const onSubmit = useCallback(
    async (formData: TMemberForm) => {
      let image;

      if (formData.image) {
        const imgResponse = await saveRegistrationImage(formData.image);

        image = imgResponse?.image.uid;
      }

      const payload = {
        imageUid: image ?? '',
        name: formData.name,
        accessLevel: formData.accessLevel,
        email: formData.email,
        joinDate: formData.joinDate?.toISOString() ?? '',
        bio: formData.bio,
        country: formData.country,
        region: formData.state,
        city: formData.city,
        skills: formData.skills.map((item) => item.value),
        teamOrProjectURL: formData.teamOrProjectURL,
        teamMemberRoles: formData.teamsAndRoles.map((item) => {
          return {
            teamUid: item.team.value,
            role: item.role,
          };
        }),
        linkedinHandler: formData.linkedin,
        discordHandler: formData.discord,
        twitterHandler: formData.twitter,
        telegramHandler: formData.telegram,
        officeHours: formData.officeHours,
        githubHandler: formData.github,
      };

      await mutateAsync({ payload });
    },
    [mutateAsync]
  );

  return (
    <>
      <button className={clsx(s.root, className)} onClick={handleSignUpClick}>
        <PlusIcon /> Add new
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
              desc="Invite new members into the PL ecosystem."
              title="Add New Member"
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
