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

interface Props {
  onClose: () => void;
  title: string;
  desc: string;
  onSubmit: (data: TMemberForm) => Promise<void>;
}

export const MemberForm = ({ onClose, title, desc, onSubmit }: Props) => {
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
  const { handleSubmit, reset } = methods;

  return (
    <div className={s.modal}>
      <div className={s.modalContent}>
        <button type="button" className={s.closeButton} onClick={onClose}>
          <CloseIcon />
        </button>
        <div className="m-0 flex h-fit w-full flex-col gap-1 border-b-[1px] border-b-gray-200 p-5">
          <h4 className="text-xl">{title}</h4>
          <p className="text-sm text-[#455468]">{desc}</p>
        </div>

        <FormProvider {...methods}>
          <form
            noValidate
            onSubmit={handleSubmit(onSubmit)}
            className="flex w-full flex-1 flex-col gap-4 p-6"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
              }
            }}
          >
            <StatusSelector />
            <ProfileDetails />
            <hr className="border-gray-200 dark:border-gray-200" />
            <ProfileLocationInput />
            <hr className="border-gray-200 dark:border-gray-200" />
            <AdditionalDetails />
            <hr className="border-gray-200 dark:border-gray-200" />
            <ContactDetails />
            <div className="mt-auto flex w-full justify-between gap-4 border-t-[1px] border-t-gray-200 pt-5">
              <button
                type="button"
                className={s.secondaryBtn}
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Cancel
              </button>
              <button className={s.primaryBtn}>Confirm</button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
};
