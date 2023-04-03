// import { useState } from 'react';
import { InformationCircleIcon } from '@heroicons/react/solid';
import { Dropdown, MultiSelect } from '@protocol-labs-network/ui';

const Options = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
  { value: '3', label: 'Option 3' },
];

export default function AddMemberStepTwo(props) {
  const values = props?.formValues;
  const dropDownValues = props?.dropDownValues;
  const handleDropDownChange = props?.handleDropDownChange;

  return (
    <>
      <div className="px-8 py-4">
        <span className="mr-2 text-sm">Protocol</span>
        <Dropdown
          options={dropDownValues.protocol}
          name="protocol"
          value={values.protocol}
          onChange={handleDropDownChange}
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>Does your team/project use any of these protocol?</span>
        </div>
      </div>

      <div className="px-8 py-4">
        <span className="mr-2 text-sm">Funding Stage*</span>
        <Dropdown
          options={dropDownValues.fundingStages}
          name="fundingStage"
          value={values.fundingStage}
          onChange={handleDropDownChange}
        />
      </div>

      <div className="px-8 py-4">
        <span className="mr-2 text-sm">Membership Source</span>
        <Dropdown
          options={dropDownValues.membershipSources}
          name="membershipSource"
          value={values.membershipSource}
          onChange={handleDropDownChange}
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            Core Contributor = a team that is building improvements/additional
            features for protocols like libp2p, IPFS, IPLD, and Filecoin. A
            Friend of PL = a team that is using protocols like libp2p, IPFS,
            IPLD, and Filecoin.
          </span>
        </div>
      </div>

      <div className="px-8 py-4">
        <MultiSelect
          name="skills"
          options={dropDownValues.industryTags}
          selectedValues={props.formValues.skills}
          onChange={props.handleDropDownChange}
          placeholder="Enter the skills"
          label="Industry Tags*"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            Add industries that you had worked in. This will make it easier for
            people to find & connect based on shared professional interests.
          </span>
        </div>
      </div>
    </>
  );
}
