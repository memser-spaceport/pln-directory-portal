import React from 'react';
import { FormField } from '../../../../../components/FormField';
import { FormCheckboxField } from '../../../../../components/FormCheckboxField';

export const ContactDetails = () => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <FormField name="linkedin" label="LinkedIn" placeholder="LinkedIn" />
        <FormField name="discord" label="Discord" placeholder="Discord" />
      </div>
      <div className="flex gap-4">
        <FormField name="twitter" label="Twitter" placeholder="Twitter" />
        <FormField name="github" label="Github" placeholder="Github" />
      </div>
      <div className="flex gap-4">
        <FormField name="bluesky" label="Bluesky" placeholder="Bluesky" />
        <FormField name="telegram" label="Telegram" placeholder="Telegram" />
      </div>
      <div className="flex gap-4">
        <FormField name="officeHours" label="Office Hours Link" placeholder="Office Hours Link" />
      </div>
      <FormCheckboxField
        name="hasInactiveEmail"
        label="Email is inactive"
        description="Hides the email from members and excludes this member from job applications and referrals."
      />
    </div>
  );
};
