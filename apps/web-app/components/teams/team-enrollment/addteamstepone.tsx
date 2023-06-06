import React from 'react';
import {
  InputField,
  ProfileImageUpload,
  TextArea,
} from '@protocol-labs-network/ui';
import { UserGroupIcon } from '@heroicons/react/solid';
import { ReactComponent as InformationCircleIcon } from '../../../public/assets/images/icons/info_icon.svg';

export default function AddMemberStepOne(props) {
  const values = props?.formValues;
  const onChange = props?.handleInputChange;
  const disableRequestorEmail = props?.disableRequestorEmail;
  return (
    <>
      {!disableRequestorEmail && <div className="pt-5">
        <InputField
          required
          name="requestorEmail"
          type="email"
          label="Requestor Email"
          value={values?.requestorEmail}
          onChange={onChange}
          placeholder="Enter your email address"
          className="custom-grey custom-outline-none border"
        />
      </div>}
      <div className="flex pt-5">
        <div className="">
          <ProfileImageUpload
            imageUrl={props.imageUrl}
            maxSize={4}
            enableHover={
              props.isEditMode || (!props.isEditMode && props.imageUrl)
                ? true
                : false
            }
            avatarIcon={props.isEditMode && UserGroupIcon}
            previewImageShape="square"
            onImageChange={props.handleImageChange}
            resetImg={props.resetImg}
            onResetImg={props.onResetImg}
          />
        </div>
        <div className="namefield inputfield">
          <InputField
            required
            value={values?.name}
            onChange={onChange}
            maxLength={150}
            disabled={props.disableName ? props.disableName : false}
            onBlur={props.onNameBlur && props.onNameBlur}
            name="name"
            onKeyDown={() => props?.setDisableNext(true)}
            label="What is your organization, company, or team name?"
            placeholder="Enter name here"
            className="custom-grey custom-outline-none border"
          />
          {props.nameExists && (
            <div className="pt-3">
              <span className="text-xs text-rose-600">
                Name already exists!
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex pt-5">
        <div>
          <InformationCircleIcon />
        </div>
        <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
          Please upload a squared image in PNG or JPEG format with file size
          less than 4MB.
        </span>
      </div>

      <div className="pt-5">
        <TextArea
          required
          value={values?.shortDescription}
          onChange={onChange}
          maxLength={1000}
          name="shortDescription"
          label="Briefly describe what your team/product/project does"
          className="custom-grey custom-outline-none min-h-[60px] border"
          placeholder="Enter your short elevator pitch here"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            One to two sentences is perfect! Use clear language and minimal
            jargon.
          </span>
        </div>
      </div>

      <div className="pt-5">
        <TextArea
          required
          value={values?.longDescription}
          onChange={onChange}
          maxLength={2000}
          name="longDescription"
          label="Long Description"
          className="custom-grey custom-outline-none min-h-[60px] border"
          placeholder="Elaborate on your elevator pitch"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Please explain what your team does in a bit more detail. 4-5
            sentences will be great!
          </span>
        </div>
      </div>

      {/* <div className="px-3 py-4">
        <Dropdown
          options={[
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '4', value: '4' },
            { label: 'Greater than 10', value: '10' },
          ]}
          onChange={() => null}
          // initialOption={selectedDirectorySortDropdownOption}
        />
      </div>
      <div className="px-3 py-4">
        <InputField
          required
          value={values?.name}
          name="businessLocation"
          label="Business Location"
          placeholder="Enter location here"
        />
      </div> */}

      <div className="inputfield hint-text pt-5">
        <InputField
          value={values?.officeHours}
          name="officeHours"
          maxLength={300}
          onChange={onChange}
          label="Team Office Hours"
          placeholder="Enter link here"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            If your team offers group office hours or open meetings that are
            open to the public, please share the link so PLN members can join
            and learn more.
          </span>
        </div>
      </div>
    </>
  );
}
