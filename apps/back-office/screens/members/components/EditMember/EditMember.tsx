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
import { INVESTOR_PROFILE_CONSTANTS } from '../../../../utils/constants';

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
      try {
        let image;

        if (formData.image) {
          const imgResponse = await saveRegistrationImage(formData.image);

          image = imgResponse?.image.uid;
        }

        const payload: {
          imageUid: string;
          name: string;
          accessLevel: string;
          email: string;
          joinDate: string;
          bio: string;
          aboutYou: string;
          country: string;
          region: string;
          city: string;
          skills: string[];
          teamOrProjectURL: string;
          teamMemberRoles: { teamUid: string; role: string }[];
          linkedinHandler: string;
          discordHandler: string;
          twitterHandler: string;
          telegramHandler: string;
          officeHours: string;
          githubHandler: string;
          investorProfile?: {
            investmentFocus: string[];
            typicalCheckSize: number;
            secRulesAccepted: boolean;
            investInStartupStages: string[];
            investInFundTypes: string[];
            type: string;
          };
        } = {
          imageUid: image || '', // Use empty string if no new image
          name: formData.name,
          accessLevel: formData.accessLevel?.value || '',
          email: formData.email,
          joinDate: formData.joinDate?.toISOString() ?? '',
          bio: formData.bio,
          aboutYou: formData.aboutYou,
          country: formData.country || '',
          region: formData.state || '',
          city: formData.city || '',
          skills: formData.skills.map((item) => item.value),
          teamOrProjectURL: formData.teamOrProjectURL,
          teamMemberRoles: formData.teamsAndRoles.map((item) => {
            return {
              teamUid: item.team?.value || '',
              role: item.role || '',
            };
          }),
          linkedinHandler: formData.linkedin,
          discordHandler: formData.discord,
          twitterHandler: formData.twitter,
          telegramHandler: formData.telegram,
          officeHours: formData.officeHours,
          githubHandler: formData.github,
        };

        // Include investor profile data if it exists
        if (formData.investorProfile) {
          payload.investorProfile = {
            investmentFocus: formData.investorProfile.investmentFocus.map(
              (item: { label: string; value: string }) => item.value
            ),
            typicalCheckSize: Number(formData.investorProfile.typicalCheckSize),
            secRulesAccepted: !!formData.investorProfile.secRulesAccepted,
            investInStartupStages: formData.investorProfile.investInStartupStages.map(
              (item: { label: string; value: string }) => item.value
            ),
            investInFundTypes: formData.investorProfile.investInFundTypes.map(
              (item: { label: string; value: string }) => item.value
            ),
            type: formData.investorProfile.type?.value || '',
          };
        }

        const res = await mutateAsync({ uid, payload, authToken });

        if (res?.data) {
          setOpen(false);
          toast.success('Member updated successfully!');
        } else {
          toast.error('Failed to update member. Please try again.');
        }
      } catch (e) {
        toast.error(e?.response?.data?.message ?? 'Failed to add new member. Please try again.');
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

    console.log('data.investorProfile?.investInStartupStages ', data.investorProfile?.investInStartupStages);

    return {
      accessLevel: options.find((option) => option.value === data.accessLevel) ?? null,
      image: null,
      name: data.name ?? '',
      email: data.email ?? '',
      joinDate: data.plnStartDate ? new Date(data.plnStartDate) : null,
      teamOrProjectURL: data.teamOrProjectURL ?? '',
      teamsAndRoles:
        data.teamMemberRoles?.map((item) => {
          const _team = formOptions.teams.find((team) => team.teamUid === item.teamUid);

          return { team: _team ? { value: _team.teamUid, label: _team.teamTitle } : null, role: item.role };
        }) ?? [],
      bio: data.bio ?? '',
      aboutYou: data.aboutYou ?? '',
      country: data.location?.country ?? '',
      state: data.location?.region ?? '',
      city: data.location?.city ?? '',
      skills: data.skills?.map((item) => ({ value: item.id, label: item.name })) ?? [],
      discord: data.discordHandler ?? '',
      github: data.githubHandler ?? '',
      linkedin: data.linkedinHandler ?? '',
      officeHours: data.officeHours ?? '',
      telegram: data.telegramHandler ?? '',
      twitter: data.twitterHandler ?? '',
      investorProfile: data.investorProfile
        ? {
            investmentFocus: (data.investorProfile?.investmentFocus ?? []).map((focus: string) => ({
              label: focus,
              value: focus,
            })),
            typicalCheckSize: data.investorProfile?.typicalCheckSize ?? null,
            secRulesAccepted: !!data.investorProfile?.secRulesAccepted,
            investInStartupStages: (data.investorProfile?.investInStartupStages ?? []).map((stage: string) => ({
              label: stage,
              value: stage,
            })),
            investInFundTypes: (data.investorProfile?.investInFundTypes ?? []).map((fundType: string) => ({
              label: fundType,
              value: fundType,
            })),
            type: data.investorProfile?.type
              ? INVESTOR_PROFILE_CONSTANTS.INVESTOR_TYPES.find(
                  (option) => option.value === data.investorProfile.type
                ) || null
              : null,
          }
        : undefined,
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
              existingImageUrl={data?.image?.url}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
