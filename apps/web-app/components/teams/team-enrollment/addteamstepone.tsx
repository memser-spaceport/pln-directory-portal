import React from 'react';
import {
  InputField,
  ProfileImageUpload,
  TextArea,
} from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function AddMemberStepOne(props) {
  const values = props?.formValues;
  const onChange = props?.handleInputChange;

  return (
    <>
      <div className="px-8 py-4">
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
      </div>
      <div className="flex px-8 pb-4 pt-6">
        <div className="basis-1/4">
          <ProfileImageUpload
            imageUrl={props.imageUrl}
            maxSize={4}
            previewImageShape="square"
            onImageChange={props.handleImageChange}
          />
        </div>
        <div className="inputfield basis-3/4 pl-1">
          <InputField
            required
            value={values?.name}
            onChange={onChange}
            maxLength={150}
            disabled={props.disableName ? props.disableName : false}
            onBlur={props.onNameBlur && props.onNameBlur}
            name="name"
            label="What is your organization, company, or team name?"
            placeholder="Enter name here"
            className="custom-grey custom-outline-none border"
          />
          {props.nameExists && (
            <div className="pt-2">
              <span className="text-xs text-rose-600">
                Name already exists!
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex px-8 pb-4 text-sm text-gray-400">
        <div>
          <InformationCircleIcon className="h-5 w-5" />
        </div>
        <span className="font-size-13">
          Please upload a squared image in PNG or JPEG format with file size
          less that 4MB.
        </span>
      </div>

      <div className="px-8 py-4">
        <TextArea
          required
          value={values?.shortDescription}
          onChange={onChange}
          maxLength={1000}
          name="shortDescription"
          label="Please briefly describe what your team/product/project does"
          info="One to two sentences is perfect! Use clear language and minimal jargon."
          className="custom-grey custom-outline-none min-h-[60px] border"
        />
      </div>

      <div className="px-8 py-4">
        <TextArea
          required
          value={values?.longDescription}
          onChange={onChange}
          maxLength={2000}
          name="longDescription"
          label="Long Description"
          info="Please explain what your team does in a bit more detail. 4-5 sentences will be great!"
          className="custom-grey custom-outline-none min-h-[60px] border"
        />
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

      <div className="inputfield hint-text px-8 py-4">
        <InputField
          value={values?.officeHours}
          name="officeHours"
          maxLength={300}
          onChange={onChange}
          label="Team Office Hours"
          placeholder="Enter address here"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            If your team offers group office hours or open meetings that are
            open to the public, please share the link so PLN members can join
            and learn more.
          </span>
        </div>
      </div>
    </>
  );
}
