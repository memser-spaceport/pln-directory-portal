import React, { useState, ChangeEvent } from 'react';
import {
  InputField,
  ProfileImageUpload,
  Dropdown,
  TextArea,
} from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';
import { FormValues } from './addteam';

interface StepOneProps {
  values: FormValues;
  handleInputChange: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
}

export default function AddMemberStepOne(props) {
  const values = props?.formValues;
  const onChange = props?.handleInputChange;
  const [imageUrl, setImageUrl] = useState<string>();

  const handleImageChange = (file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => setImageUrl(reader.result as string);
  };

  return (
    <>
      <div className="flex px-8 py-4">
        <div className="basis-1/4">
          <ProfileImageUpload
            imageUrl={imageUrl}
            maxSize={4}
            onImageChange={handleImageChange}
          />
        </div>
        <div className="basis-3/4 pl-1">
          <InputField
            required
            value={values?.name}
            onChange={onChange}
            name="name"
            label="What is your organization, company, or team name?"
            placeholder="Enter name here"
          />
        </div>
      </div>

      <div className="flex px-8 pb-4 text-sm text-gray-400">
        <div>
          <InformationCircleIcon className="h-5 w-5" />
        </div>
        <span>Please upload a squared image in PNG or JPEG format only</span>
      </div>

      <div className="px-8 py-4">
        <TextArea
          required
          value={values?.description}
          onChange={onChange}
          name="description"
          label="Please briefly describe what your team/product/project does"
          placeholder="Enter your email address"
        />
      </div>

      <div className="px-8 py-4">
        <TextArea
          required
          value={values?.longDescription}
          onChange={onChange}
          name="longDescription"
          label="Long Description"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
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

      <div className="px-8 py-4">
        <InputField
          required
          value={values?.officeHoursLink}
          name="teamOfficeHours"
          onChange={onChange}
          label="Team Office Hours"
          placeholder="Enter address here"
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
