import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { MemberForm } from '../MemberForm/MemberForm';
import clsx from 'clsx';
import { EditIcon } from '../icons';
import { TMemberForm } from '../../types/member';
import { saveRegistrationImage } from '../../../../utils/services/member';

import s from './EditMember.module.scss';
import { useMember } from '../../../../hooks/members/useMember';
import { options } from '../MemberForm/StatusSelector';
import { useMemberFormOptions } from '../../../../hooks/members/useMemberFormOptions';
import { toast } from 'react-toastify';
import { useUpdateMember } from '../../../../hooks/members/useUpdateMember';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  className?: string;
  uid: string;
  authToken: string;
}

export const EditMember = ({ className, uid, authToken }: Props) => {
  const [open, setOpen] = useState(false);

  const handleSignUpClick = () => {
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const { mutateAsync } = useUpdateMember();

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

      const res = await mutateAsync({ uid, payload, authToken });

      if (res?.data) {
        setOpen(false);
        toast.success('Member updated successfully!');
      } else {
        toast.error('Failed to update member. Please try again.');
      }
    },
    [mutateAsync, uid, authToken]
  );

  const { data } = useMember(uid, open);
  const { data: formOptions } = useMemberFormOptions(open);

  const initialData = useMemo(() => {
    if (!data || !formOptions) {
      return null;
    }

    return {
      accessLevel: options.find((option) => option.value === data.accessLevel) ?? null,
      image: null,
      name: data.name ?? '',
      email: data.email ?? '',
      joinDate: data.plnStartDate ? new Date(data.plnStartDate) : null,
      teamOrProjectURL: data.teamOrProjectURL ?? '',
      teamsAndRoles: data.teamMemberRoles?.map((item) => {
        const _team = formOptions.teams.find((team) => team.teamUid === item.teamUid);

        return { team: _team ? { value: _team.teamUid, label: _team.teamTitle } : null, role: item.role } ?? [];
      }),
      bio: data.bio ?? '',
      country: data.location?.country ?? '',
      state: data.location?.state ?? '',
      city: data.location?.city ?? '',
      skills: data.skills?.map((item) => ({ value: item.id, label: item.name })) ?? [],
      discord: data.discordHandler ?? '',
      github: data.githubHandler ?? '',
      linkedin: data.linkedInHandler ?? '',
      officeHours: data.officeHours ?? '',
      telegram: data.telegramHandler ?? '',
      twitter: data.twitterHandler ?? '',
    };
  }, [data, formOptions]);

  return (
    <>
      <button className={clsx(s.root, className)} onClick={handleSignUpClick}>
        <EditIcon /> Edit
      </button>
      <AnimatePresence>
        {open && initialData && (
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
              initialData={initialData}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
