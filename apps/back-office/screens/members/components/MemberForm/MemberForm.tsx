import React, { useEffect, useMemo } from 'react';

import s from './MemberForm.module.scss';
import { CloseIcon } from '../icons';
import { FormProvider, useForm, Resolver } from 'react-hook-form';
import { options, StatusSelector } from './StatusSelector';
import { TMemberForm } from '../../types/member';
import { ProfileDetails } from './ProfileDetails/ProfileDetails';
import { ProfileLocationInput } from './ProfileLocationInput';
import { AdditionalDetails } from './AdditionalDetails/AdditionalDetails';
import { ContactDetails } from './ContactDetails/ContactDetails';
import { RbacSection } from './RbacSection/RbacSection';
import { yupResolver } from '@hookform/resolvers/yup';
import { memberFormSchema } from './helpers';
import { useRbacRoles } from '../../../../hooks/access-control/useRbacRoles';
import { useRbacPermissions } from '../../../../hooks/access-control/useRbacPermissions';
import { usePoliciesList } from '../../../../hooks/access-control/usePoliciesList';

interface Props {
  onClose: () => void;
  title: string;
  desc: string;
  onSubmit: (data: TMemberForm) => Promise<void>;
  initialData?: TMemberForm;
  existingImageUrl?: string;
  authToken?: string;
}

export const MemberForm = ({ onClose, title, desc, onSubmit, initialData, existingImageUrl, authToken }: Props) => {
  const methods = useForm<TMemberForm>({
    defaultValues: {
      memberStateStatus: null,
      rbacRoles: [],
      rbacGroups: [],
      rbacExceptions: [],
      accessLevel: options.find((option) => option.value === 'L4') ?? null,
      image: null,
      name: '',
      email: '',
      joinDate: null,
      bio: '',
      aboutYou: '',
      country: '',
      state: '',
      city: '',
      skills: [],
      discord: '',
      github: '',
      linkedin: '',
      officeHours: '',
      telegram: '',
      twitter: '',
      investorProfile: {
        investmentFocus: [],
        typicalCheckSize: null,
        secRulesAccepted: false,
        type: null,
        investInStartupStages: [],
        investInFundTypes: [],
      },
      teamsAndRoles: [],
    },
    resolver: yupResolver(memberFormSchema) as Resolver<TMemberForm>,
  });
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    if (initialData) {
      reset(initialData);
    }
  }, [initialData, reset]);

  const { data: rbacRolesData, isLoading: rolesLoading } = useRbacRoles({ authToken });
  const { data: policiesData, isLoading: policiesLoading } = usePoliciesList({ authToken });
  const { data: rbacPermissionsData, isLoading: permsLoading } = useRbacPermissions({ authToken });
  const isLoadingOptions = rolesLoading || policiesLoading || permsLoading;

  const rolesOptions = useMemo(
    () => (rbacRolesData ?? []).map((r) => ({ label: r.name, value: r.code })),
    [rbacRolesData]
  );

  const groupsOptions = useMemo(
    () =>
      [...new Set((policiesData ?? []).map((p) => p.group))]
        .sort()
        .map((g) => ({ label: g, value: g })),
    [policiesData]
  );

  const exceptionsOptions = useMemo(
    () => (rbacPermissionsData ?? []).map((p) => ({ label: p.description ?? p.code, value: p.code })),
    [rbacPermissionsData]
  );

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
            <RbacSection
              rolesOptions={rolesOptions}
              groupsOptions={groupsOptions}
              exceptionsOptions={exceptionsOptions}
              isLoadingOptions={isLoadingOptions}
              policiesData={policiesData ?? []}
            />
            <StatusSelector isAddNew={!initialData} />
            <ProfileDetails existingImageUrl={existingImageUrl} />
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
              <button className={s.primaryBtn} disabled={isSubmitting}>
                {isSubmitting ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
};
