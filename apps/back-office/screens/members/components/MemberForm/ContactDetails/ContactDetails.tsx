import React from 'react';
import { FormField } from '../../../../../components/FormField';

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
        <FormField name="telegram" label="Telegram" placeholder="Telegram" />
        <FormField name="officeHours" label="Office Hours Link" placeholder="Office Hours Link" />
      </div>
    </div>
  );
};
