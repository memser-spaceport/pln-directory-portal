import { ReactComponent as InformationCircleIcon } from '../../public/assets/icons/info_icon.svg';
import { Dropdown, MultiSelect } from '@protocol-labs-network/ui';

export default function TeamStepTwo(props) {
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
          onChange={handleDropDownChange}
          placeholder="Select a Protocol"
          disabled={!props.isEditEnabled}
          label="Protocol"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Does your team/project use any of these protocol?
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
          disabled={!props.isEditEnabled}
          onChange={handleDropDownChange}
        />
      </div>

      <div className="pt-5">
        <MultiSelect
          options={dropDownValues?.membershipSources}
          name="membershipSources"
          required={true}
          selectedValues={values.membershipSources}
          placeholder="Please select applicable options"
          onChange={handleDropDownChange}
          disabled={!props.isEditEnabled}
          label="Membership Source"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Core Contributor = a team that is building improvements/additional
            features for protocols like libp2p, IPFS, IPLD, and Filecoin. A
            Friend of PL = a team that is using protocols like libp2p, IPFS,
            IPLD, and Filecoin.
          </span>
        </div>
      </div>

      <div className="pt-5">
        <MultiSelect
          name="industryTags"
          options={dropDownValues?.industryTags}
          selectedValues={values.industryTags}
          onChange={props.handleDropDownChange}
          disabled={!props.isEditEnabled}
          placeholder="Enter the skills"
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
