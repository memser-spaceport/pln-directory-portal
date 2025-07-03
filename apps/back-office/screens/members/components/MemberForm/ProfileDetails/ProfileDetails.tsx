import React from 'react';
import { ProfileImageInput } from '../ProfileImageInput';
import { FormField } from '../../../../../components/FormField';
import { FormDateField } from '../../../../../components/FormDateField';
import { FormAreaField } from '../../../../../components/FormAreaField';

export const ProfileDetails = () => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-start gap-3">
        <ProfileImageInput />
        <FormField name="name" label="Name" placeholder="Name" isRequired />
      </div>
      <div className="flex w-full items-start gap-4">
        <FormField name="email" label="Email" placeholder="Email" isRequired />
        <FormDateField name="joinDate" label="Join Date" />
      </div>
      <div className="items-startq flex gap-4">
        <FormAreaField name="bio" placeholder="Short description" label="Bio" />
      </div>
    </div>
  );
};
