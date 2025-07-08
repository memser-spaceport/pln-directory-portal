import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import s from './AddMember.module.scss';
import { MemberForm } from '../MemberForm/MemberForm';
import clsx from 'clsx';
import { PlusIcon } from '../icons';
import { TMemberForm } from '../../types/member';
import { saveRegistrationImage } from '../../../../utils/services/member';
import { useAddMember } from '../../../../hooks/members/useAddMember';
import { toast } from 'react-toastify';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  className?: string;
  authToken: string;
  onClick?: () => void;
}

export const AddMember = ({ className, authToken, onClick }: Props) => {
  const [open, setOpen] = useState(false);

  const handleSignUpClick = () => {
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    onClick?.();
  }, [onClick]);

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
        accessLevel: formData.accessLevel?.value,
        email: formData.email,
        joinDate: formData.joinDate?.toISOString() ?? '',
        bio: formData.bio,
        country: formData.country ?? '',
        region: formData.state ?? '',
        city: formData.city ?? '',
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

      const res = await mutateAsync({ payload, authToken });

      if (res?.data) {
        setOpen(false);
        toast.success('New member added successfully!');
      } else {
        toast.error('Failed to add new member. Please try again.');
      }
    },
    [mutateAsync, authToken]
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
            style={{ zIndex: 100, position: 'fixed', inset: '0 0 0 0' }}
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
