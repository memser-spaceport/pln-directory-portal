import React from 'react';
import { FormMultiselectField } from '../../../../../components/FormMultiselectField';
import { FormTagInput } from '../../../../../components/FormTagInput';
import { useMemberFormOptions } from '../../../../../hooks/members/useMemberFormOptions';
import { FormField } from '../../../../../components/FormField';
import { FormCheckboxField } from '../../../../../components/FormCheckboxField';
import { FormSelectField } from '../../../../../components/FormSelectField';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { TMemberForm } from '../../../types/member';
import { useWatch } from 'react-hook-form';

export const AdditionalDetails = () => {
  const { data } = useMemberFormOptions();
  const { control } = useFormContext<TMemberForm>();

  const accessLevel = useWatch({
    control,
    name: 'accessLevel',
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'teamsAndRoles',
  });

  const isInvestor = accessLevel?.value === 'L5' || accessLevel?.value === 'L6';

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
      <FormField name="teamOrProjectURL" label="Team or project URL" placeholder="Team or Project URL" />

      {isInvestor && (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-gray-900">Investor Profile</h3>
          <FormCheckboxField
            name="investorProfile.secRulesAccepted"
            label="I'm an accredited investor under SEC rules"
          />
          <FormCheckboxField name="investorProfile.isInvestViaFund" label="I invest via a fund" />
          <FormTagInput
            name="investorProfile.investmentFocus"
            placeholder="Type and press enter to add investment focus areas"
            label="Investment Focus"
            description="Add custom investment focus areas (e.g., AI, Web3, DeFi)"
          />
          <FormField name="investorProfile.typicalCheckSize" label="Typical Check Size" placeholder="e.g., $50,000" />
          <FormMultiselectField
            name="investorProfile.investInStartupStages"
            placeholder="Select startup stages"
            label="Invest in Startup Stages"
            options={[
              { value: 'Pre-seed', label: 'Pre-seed' },
              { value: 'Seed', label: 'Seed' },
              { value: 'Series A', label: 'Series A' },
              { value: 'Series B', label: 'Series B' },
              { value: 'Series C', label: 'Series C' },
              { value: 'Series D and later', label: 'Series D and later' },
            ]}
          />
          <FormMultiselectField
            name="investorProfile.investInFundTypes"
            placeholder="Select fund types"
            label="Invest in Fund Types"
            options={[
              { value: "I don't invest in VC Funds", label: "I don't invest in VC Funds" },
              { value: 'Early stage', label: 'Early stage' },
              { value: 'Late stage', label: 'Late stage' },
              { value: 'Fund-of-funds', label: 'Fund-of-funds' },
            ]}
          />
        </div>
      )}

      {fields?.length > 0 && (
        <div className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <div className="flex items-start gap-2" key={index}>
              <FormSelectField
                name={`teamsAndRoles.${index}.team`}
                placeholder="Select team"
                label="Team"
                options={
                  data?.teams?.map((item: { teamUid: string; teamTitle: string }) => ({
                    value: item.teamUid,
                    label: item.teamTitle,
                  })) ?? []
                }
              />
              <FormField name={`teamsAndRoles.${index}.role`} placeholder="Role" label="Role" />
              <button
                className="mt-6 flex h-full items-end rounded bg-red-100 p-2"
                onClick={() => remove(index)}
                type="button"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        className="flex items-center gap-1 text-sm text-[#1B4DFF]"
        onClick={() => {
          append({ team: null, role: '' });
        }}
        type="button"
      >
        Add an existing team <PlusIcon />
      </button>
    </div>
  );
};

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.25 8C14.25 8.19891 14.171 8.38968 14.0303 8.53033C13.8897 8.67098 13.6989 8.75 13.5 8.75H8.75V13.5C8.75 13.6989 8.67098 13.8897 8.53033 14.0303C8.38968 14.171 8.19891 14.25 8 14.25C7.80109 14.25 7.61032 14.171 7.46967 14.0303C7.32902 13.8897 7.25 13.6989 7.25 13.5V8.75H2.5C2.30109 8.75 2.11032 8.67098 1.96967 8.53033C1.82902 8.38968 1.75 8.19891 1.75 8C1.75 7.80109 1.82902 7.61032 1.96967 7.46967C2.11032 7.32902 2.30109 7.25 2.5 7.25H7.25V2.5C7.25 2.30109 7.32902 2.11032 7.46967 1.96967C7.61032 1.82902 7.80109 1.75 8 1.75C8.19891 1.75 8.38968 1.82902 8.53033 1.96967C8.67098 2.11032 8.75 2.30109 8.75 2.5V7.25H13.5C13.6989 7.25 13.8897 7.32902 14.0303 7.46967C14.171 7.61032 14.25 7.80109 14.25 8Z"
      fill="#1B4DFF"
    />
  </svg>
);

const TrashIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M18.5625 4.125H15.4688V3.09375C15.4688 2.45557 15.2152 1.84353 14.764 1.39227C14.3127 0.941015 13.7007 0.6875 13.0625 0.6875H8.9375C8.29932 0.6875 7.68728 0.941015 7.23602 1.39227C6.78477 1.84353 6.53125 2.45557 6.53125 3.09375V4.125H3.4375C3.164 4.125 2.90169 4.23365 2.7083 4.42705C2.5149 4.62044 2.40625 4.88275 2.40625 5.15625C2.40625 5.42975 2.5149 5.69206 2.7083 5.88545C2.90169 6.07885 3.164 6.1875 3.4375 6.1875H3.78125V17.875C3.78125 18.3308 3.96233 18.768 4.28466 19.0903C4.60699 19.4127 5.04416 19.5938 5.5 19.5938H16.5C16.9558 19.5938 17.393 19.4127 17.7153 19.0903C18.0377 18.768 18.2188 18.3308 18.2188 17.875V6.1875H18.5625C18.836 6.1875 19.0983 6.07885 19.2917 5.88545C19.4851 5.69206 19.5938 5.42975 19.5938 5.15625C19.5938 4.88275 19.4851 4.62044 19.2917 4.42705C19.0983 4.23365 18.836 4.125 18.5625 4.125ZM8.59375 3.09375C8.59375 3.00258 8.62997 2.91515 8.69443 2.85068C8.7589 2.78622 8.84633 2.75 8.9375 2.75H13.0625C13.1537 2.75 13.2411 2.78622 13.3056 2.85068C13.37 2.91515 13.4062 3.00258 13.4062 3.09375V4.125H8.59375V3.09375ZM16.1562 17.5312H5.84375V6.1875H16.1562V17.5312ZM9.96875 8.9375V14.4375C9.96875 14.711 9.8601 14.9733 9.6667 15.1667C9.47331 15.3601 9.211 15.4688 8.9375 15.4688C8.664 15.4688 8.40169 15.3601 8.2083 15.1667C8.0149 14.9733 7.90625 14.711 7.90625 14.4375V8.9375C7.90625 8.664 8.0149 8.40169 8.2083 8.2083C8.40169 8.0149 8.664 7.90625 8.9375 7.90625C9.211 7.90625 9.47331 8.0149 9.6667 8.2083C9.8601 8.40169 9.96875 8.664 9.96875 8.9375ZM14.0938 8.9375V14.4375C14.0938 14.711 13.9851 14.9733 13.7917 15.1667C13.5983 15.3601 13.336 15.4688 13.0625 15.4688C12.789 15.4688 12.5267 15.3601 12.3333 15.1667C12.1399 14.9733 12.0312 14.711 12.0312 14.4375V8.9375C12.0312 8.664 12.1399 8.40169 12.3333 8.2083C12.5267 8.0149 12.789 7.90625 13.0625 7.90625C13.336 7.90625 13.5983 8.0149 13.7917 8.2083C13.9851 8.40169 14.0938 8.664 14.0938 8.9375Z"
      fill="#FF3838"
    />
  </svg>
);
