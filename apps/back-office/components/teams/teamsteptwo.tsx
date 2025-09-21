import { useState } from 'react';
import CreatableSelect from 'react-select/creatable';
import { ReactComponent as InformationCircleIcon } from '../../public/assets/icons/info_icon.svg';
import { Dropdown, MultiSelect } from '@protocol-labs-network/ui';
import FocusAreasList from '../focus-areas-popup/focus-areas-list';
import FocusAreasPopup from '../focus-areas-popup/focus-areas-popup';
import { ABOUT_PLN_LINK, INVESTOR_PROFILE_CONSTANTS } from '../../utils/constants';

export default function TeamStepTwo(props) {
  const values = props?.formValues;
  const dropDownValues = props?.dropDownValues;
  const handleDropDownChange = props?.handleDropDownChange;
  const isRequired = props?.isRequired;
  const focusAreas = props?.focusAreas;
  const isEditEnabled = props?.isEditEnabled;
  const handleFoucsAreaSave = props?.handleFoucsAreaSave;
  const handleInputChange = props?.handleInputChange;
  const [isFocusAreaModalOpen, setIsFocusAreaModalOpen] = useState(false);
  const from = props?.from;

  const onOpenFocusAreaModal = () => {
    setIsFocusAreaModalOpen(true);
  };

  const onCloseFocusAreaModal = () => {
    setIsFocusAreaModalOpen(false);
  };

  return (
    <>
      <div className="pt-5">
        <MultiSelect
          options={dropDownValues?.protocol}
          name="technologies"
          selectedValues={values.technologies}
          onChange={handleDropDownChange}
          placeholder="Select Protocol(s)"
          disabled={!props.isEditEnabled}
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
        <br />
        <br />
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
          selectedValues={values.membershipSources}
          placeholder="Select the Membership Sources"
          onChange={handleDropDownChange}
          disabled={!props.isEditEnabled}
          label="Membership Source"
        />
      </div>

      <div className="pt-5">
        <MultiSelect
          name="industryTags"
          options={dropDownValues?.industryTags}
          selectedValues={values.industryTags}
          onChange={props.handleDropDownChange}
          disabled={!props.isEditEnabled}
          placeholder="Select the Industry Tags"
          label="Industry Tags"
          required={true}
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Add industries that you had worked in. This will make it easier for people to find & connect based on shared
            professional interests.
          </span>
        </div>
      </div>

      <div className="pt-5">
        <label className="flex items-center">
          <input
            type="checkbox"
            name="isFund"
            checked={values.isFund}
            onChange={handleInputChange}
            disabled={!props.isEditEnabled}
            className="mr-2"
          />
          <span className="text-sm font-bold">This is a fund</span>
        </label>
      </div>

      {values.isFund && (
        <>
          <div className="pt-5">
            <span className="mr-2 text-sm font-bold">Investor Profile</span>
            <br />
            <br />
            <div className="mb-4">
              <label className="mb-2 block text-sm font-bold">Investment Focus</label>
              <CreatableSelect
                isMulti
                isDisabled={!props.isEditEnabled}
                placeholder="Type and press enter to add investment focus areas"
                formatCreateLabel={(inputValue) => `Add "${inputValue}"`}
                value={values.investmentFocus || []}
                onChange={(selectedOptions) => {
                  handleDropDownChange(selectedOptions, 'investmentFocus');
                }}
                styles={{
                  control: (baseStyles) => ({
                    ...baseStyles,
                    borderRadius: '8px',
                    border: '1px solid rgba(203, 213, 225, 0.50)',
                    background: '#fff',
                    fontSize: '14px',
                    minHeight: '40px',
                    '&:hover': {
                      border: '1px solid #5E718D',
                    },
                    '&:focus-within': {
                      borderColor: '#5E718D',
                      boxShadow: '0 0 0 4px rgba(27, 56, 96, 0.12)',
                    },
                  }),
                  multiValue: (base) => ({
                    ...base,
                    backgroundColor: '#f1f5f9',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    padding: '2px 6px',
                  }),
                  multiValueLabel: (base) => ({
                    ...base,
                    color: '#455468',
                    fontSize: '14px',
                  }),
                  multiValueRemove: (base) => ({
                    ...base,
                    color: '#455468',
                    '&:hover': {
                      backgroundColor: 'transparent',
                      color: '#d21a0e',
                    },
                  }),
                  input: (base) => ({
                    ...base,
                    fontSize: '14px',
                  }),
                  placeholder: (base) => ({
                    ...base,
                    fontSize: '14px',
                    color: '#455468a0',
                  }),
                }}
              />
            </div>
            <div className="flex pt-3">
              <div>
                <InformationCircleIcon />
              </div>
              <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
                What are your primary investment focus areas?
              </span>
            </div>
          </div>

          <div className="pt-5">
            <label htmlFor="typicalCheckSize" className="mb-2 block text-sm font-bold">
              Typical Check Size
            </label>
            <input
              type="number"
              id="typicalCheckSize"
              name="typicalCheckSize"
              value={values.typicalCheckSize}
              onChange={handleInputChange}
              placeholder="e.g., $50,000"
              disabled={!props.isEditEnabled}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <div className="flex pt-3">
              <div>
                <InformationCircleIcon />
              </div>
              <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
                What is your typical investment check size range?
              </span>
            </div>
          </div>

          <div className="pt-5">
            <MultiSelect
              options={INVESTOR_PROFILE_CONSTANTS.STAGES}
              name="investInStartupStages"
              selectedValues={values.investInStartupStages || []}
              onChange={handleDropDownChange}
              placeholder="Select startup stages"
              disabled={!props.isEditEnabled}
              label="Invest in Startup Stages"
            />
          </div>

          <div className="pt-5">
            <MultiSelect
              options={INVESTOR_PROFILE_CONSTANTS.FUND_TYPES}
              name="investInFundTypes"
              selectedValues={values.investInFundTypes || []}
              onChange={handleDropDownChange}
              placeholder="Select fund types"
              disabled={!props.isEditEnabled}
              label="Invest in Fund Types"
            />
          </div>
        </>
      )}

      {isRequired && (
        <div style={{ pointerEvents: props?.isEditEnabled ? 'auto' : 'none' }}>
          <FocusAreasList
            rawData={focusAreas}
            selectedItems={values.focusAreas}
            onOpen={onOpenFocusAreaModal}
            from={from}
            isEditEnabled={isEditEnabled}
          />
          <div className="flex pt-3">
            <div>
              <InformationCircleIcon />
            </div>
            <p className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] ">
              <span className="opacity-40">
                Protocol Labs&apos;s vision for the future is built on three core focus areas that aim to harness
                humanity&apos;s potential for good, navigate potential pitfalls, and ensure a future where technology
                empowers humanity
              </span>{' '}
              -{' '}
              <a className="text-[#156FF7]" href={ABOUT_PLN_LINK} target="_blank" rel="noreferrer">
                Learn more.
              </a>
            </p>
          </div>
        </div>
      )}
      {isFocusAreaModalOpen && (
        <FocusAreasPopup
          handleFoucsAreaSave={handleFoucsAreaSave}
          onClose={onCloseFocusAreaModal}
          selectedItems={values.focusAreas ?? []}
          focusAreas={focusAreas}
        />
      )}
    </>
  );
}
