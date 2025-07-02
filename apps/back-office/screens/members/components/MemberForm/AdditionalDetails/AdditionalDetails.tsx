import React from 'react';
import { FormMultiselectField } from '../../../../../components/FormMultiselectField';
import { useMemberFormOptions } from '../../../../../hooks/members/useMemberFormOptions';
import { FormField } from '../../../../../components/FormField';
import { FormSelectField } from '../../../../../components/FormSelectField';

export const AdditionalDetails = () => {
  const { data } = useMemberFormOptions();

  return (
    <div className="flex flex-col gap-4">
      <FormMultiselectField
        name="skills"
        placeholder="Select skills"
        label="Professional Skills"
        options={
          data?.skills?.map((item: { id: string; name: string }) => ({
            value: item.id,
            label: item.name,
          })) ?? []
        }
      />
      <FormSelectField
        name="project"
        placeholder="Select project"
        label="Project"
        options={
          data?.projects?.map((item: { projectUid: string; projectName: string }) => ({
            value: item.projectUid,
            label: item.projectName,
          })) ?? []
        }
      />
      <FormField name="role" label="Role" placeholder="Role" />
    </div>
  );
};
