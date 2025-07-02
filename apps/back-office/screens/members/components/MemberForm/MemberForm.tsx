import React from 'react';

import s from './MemberForm.module.scss';
import { CloseIcon } from '../icons';
import { FormProvider, useForm } from 'react-hook-form';
import { StatusSelector } from './StatusSelector';
import { TMemberForm } from '../../types/member';
import { ProfileDetails } from './ProfileDetails/ProfileDetails';
import { ProfileLocationInput } from './ProfileLocationInput';
import { AdditionalDetails } from './AdditionalDetails/AdditionalDetails';
import { ContactDetails } from './ContactDetails/ContactDetails';
import { saveRegistrationImage } from '../../../../utils/services/member';
import { useUpdateMember } from '../../../../hooks/members/useUpdateMember';
import { omit } from 'lodash';

interface Props {
  onClose: () => void;
}

export const MemberForm = ({ onClose }: Props) => {
  const methods = useForm<TMemberForm>({
    defaultValues: {
      accessLevel: null,
      image: null,
      name: '',
      email: '',
      joinDate: null,
      bio: '',
      country: '',
      state: '',
      city: '',
      skills: [],
      project: null,
      role: '',
      discord: '',
      github: '',
      linkedin: '',
      officeHours: '',
      telegram: '',
      twitter: '',
    },
  });
  const { handleSubmit } = methods;

  const { mutateAsync } = useUpdateMember();

  const onSubmit = async (formData: TMemberForm) => {
    let image;

    if (formData.image) {
      const imgResponse = await saveRegistrationImage(formData.image);

      image = imgResponse?.image.uid;
    }

    const payload = {
      participantType: 'MEMBER',
      // referenceUid: member.id,
      // uniqueIdentifier: member.email,
      newData: {
        // ...formatPayload(memberData.memberInfo, formData),
        // imageUid: image ? image : memberData.memberInfo.imageUid,
      },
    };

    const { data, status } = await mutateAsync({
      // uid: memberData.memberInfo.uid,
      payload,
    });
  };

  return (
    <div className={s.modal}>
      <div className={s.modalContent}>
        <button type="button" className={s.closeButton} onClick={onClose}>
          <CloseIcon />
        </button>
        <div className="m-0 flex h-fit w-full flex-col gap-1 border-b-[1px] border-b-gray-200 p-5">
          <h4 className="text-xl">Add new member</h4>
          <p className="text-sm text-[#455468]">Invite new members into the PL ecosystem.</p>
        </div>

        <FormProvider {...methods}>
          <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-1 flex-col gap-4 p-6">
            <StatusSelector />
            <ProfileDetails />
            <hr className="border-gray-200 dark:border-gray-200" />
            <ProfileLocationInput />
            <hr className="border-gray-200 dark:border-gray-200" />
            <AdditionalDetails />
            <hr className="border-gray-200 dark:border-gray-200" />
            <ContactDetails />
            <div className="mt-auto flex w-full justify-between gap-4 border-t-[1px] border-t-gray-200 pt-5">
              <button className={s.secondaryBtn}>Cancel</button>
              <button className={s.primaryBtn}>Confirm</button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
};

function formatPayload(memberInfo: any, formData: TMemberForm) {
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
    moreDetails: memberInfo.moreDetails,
    openToWork: memberInfo.openToWork,
    plnFriend: memberInfo.plnFriend,
    teamAndRoles: memberInfo.teamMemberRoles,
    projectContributions: memberInfo.projectContributions?.map((contribution: any) => ({
      ...omit(contribution, 'projectName'),
    })),
    skills: formData.skills?.map((skill: Record<string, string>) => ({
      title: skill.name,
      uid: skill.id,
    })),
    bio: formData.bio,
  };
}
