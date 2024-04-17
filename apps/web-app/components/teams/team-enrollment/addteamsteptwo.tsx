import { ReactComponent as InformationCircleIcon } from '../../../public/assets/images/icons/info_icon.svg';
import { Dropdown, MultiSelect } from '@protocol-labs-network/ui';
import { useState } from 'react';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { ABOUT_PLN_LINK, APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import FocusAreasPopup from '../../shared/focua-areas-popup/focus-areas-popup';
import FocusAreasList from '../../shared/focua-areas-popup/focus-areas-list';

export default function AddTeamStepTwo(props) {
  const values = props?.formValues;
  const dropDownValues = props?.dropDownValues;
  const handleDropDownChange = props?.handleDropDownChange;
  const focusAreas = props?.focusAreas;
  const handleFoucsAreaSave = props?.handleFoucsAreaSave;
  const [isFocusAreaModalOpen, setIsFocusAreaModalOpen] = useState(false);
  const from = props?.from;
  const analytics = useAppAnalytics();
  const userInfo = getUserInfo();
  const isRequired = props?.isRequired;

  const onOpenFocusAreaModal = (mode) => {
    if (mode === 'Select') {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.SELECT_FOCUS_AREA_BTN_CLICKED,
        {
          from,
          user: userInfo,
          team: values,
        }
      );
    }
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
        <br />
        <br />
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

        {isRequired && (
          <>
            <FocusAreasList
              rawData={focusAreas}
              selectedItems={values.focusAreas}
              onOpen={onOpenFocusAreaModal}
              teamDetails={values}
              from={from}
            />
            <div className="flex pt-3">
              <div>
                <InformationCircleIcon />
              </div>
              <p className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] ">
                <span className="opacity-40">
                  Protocol Labs&apos;s vision for the future is built on three
                  core focus areas that aim to harness humanity&apos;s potential
                  for good, navigate potential pitfalls, and ensure a future
                  where technology empowers humanity
                </span>{' '}
                -{' '}
                <a
                  className="text-[#156FF7]"
                  href={ABOUT_PLN_LINK}
                  target="_blank"
                  rel="noreferrer"
                >
                  Learn more.
                </a>
              </p>
            </div>
          </>
        )}
      </div>
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
