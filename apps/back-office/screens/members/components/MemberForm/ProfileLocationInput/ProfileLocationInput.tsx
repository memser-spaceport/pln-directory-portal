import { FormField } from 'apps/back-office/components/FormField';
import React from 'react';

import s from './ProfileLocationInput.module.scss';

export const ProfileLocationInput = () => {
  return (
    <div className={s.row}>
      <FormField name="country" placeholder="Enter country" label="Country" />
      <FormField name="state" placeholder="Enter state or province" label="State or Province" />
      <FormField name="city" placeholder="Enter your metro area or city" label="Metro Area/City" />
    </div>
  );
};
