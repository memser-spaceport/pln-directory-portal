import { ReactComponent as InformationCircleIcon } from '../../../public/assets/images/icons/info_icon.svg';
import { Dropdown, MultiSelect } from '@protocol-labs-network/ui';

export default function AddTeamStepTwo(props) {
  const values = props?.formValues;
  const dropDownValues = props?.dropDownValues;
  const handleDropDownChange = props?.handleDropDownChange;

  return (
    <>
      <div className="pt-5">
        <MultiSelect
          options={dropDownValues?.protocol}
          name="technologies"
          selectedValues={values.technologies}
          placeholder="Select Protocol(s)"
          onChange={handleDropDownChange}
          label="Protocol"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Does your team/project use any of these protocol(s)?
          </span>
        </div>
      </div>

      <div className="pt-5">
        <span className="mr-2 text-sm font-bold">Funding Stage*</span>
        <Dropdown
          options={dropDownValues?.fundingStages}
          name="fundingStage"
          required={true}
          placeholder="Select a Stage"
          value={values.fundingStage}
          onChange={handleDropDownChange}
        />
      </div>

      <div className="pt-5">
        <MultiSelect
          options={dropDownValues?.membershipSources}
          name="membershipSources"
          selectedValues={values.membershipSources}
          placeholder="Select the Membership Sources"
          onChange={handleDropDownChange}
          label="Membership Source"
        />
      </div>

      <div className="pt-5">
        <MultiSelect
          name="industryTags"
          options={dropDownValues?.industryTags}
          selectedValues={values.industryTags}
          onChange={props.handleDropDownChange}
          placeholder="Select the Industry Tags"
          label="Industry Tags"
          required={true}
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Add industries that you had worked in. This will make it easier for
            people to find & connect based on shared professional interests.
          </span>
        </div>
      </div>
    </>
  );
}
