import { InputField, ProfileImageUpload } from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function AddMemberBasicForm(props) {
  const values = props.formValues;
  const onChange = props.onChange;

  return (
    <>
      <div className="flex content-around px-8 pt-3">
        <div className="profileImage justify-content basis-1/3">
          <ProfileImageUpload
            imageUrl={props.imageUrl}
            maxSize={4}
            onImageChange={props.handleImageChange}
            disabled={!props.isEditEnabled}
          />
        </div>
        <div className="namefield inputfield basis-2/3">
          <InputField
            required={true}
            name="name"
            label="Name"
            pattern="^[a-zA-Z\s]*$"
            maxLength={64}
            value={values?.name}
            disabled={!props.isEditEnabled}
            onChange={onChange}
            placeholder="Enter your full name"
            className="custom-grey custom-outline-none border"
          />
        </div>
      </div>

      <div className="flex px-8 pt-3 text-sm text-gray-400">
        <div>
          <InformationCircleIcon className="h-5 w-5" />
        </div>
        <span className="font-size-13">
          Please upload a image in PNG or JPEG format with file size less that
          4MB.
        </span>
      </div>

      <div className="inputfield px-8 py-4">
        <InputField
          required
          name="email"
          type="email"
          label="Email"
          maxLength={255}
          value={values?.email}
          disabled={!props.isEditEnabled}
          onChange={onChange}
          onBlur={props.onEmailBlur && props.onEmailBlur}
          placeholder="Enter your email address"
          className="custom-grey custom-outline-none border"
        />
      </div>

      {props.emailExists && (
        <span className="px-8 py-1 text-xs text-rose-600">
          Email already exists!
        </span>
      )}

      <div className="px-8 py-4">
        <InputField
          name="plnStartDate"
          type="date"
          onChange={onChange}
          value={values?.plnStartDate}
          disabled={!props.isEditEnabled}
          label="PLN Start Date"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span className="font-size-13">
            What date did your team join the PLN? If you don&apos;t know, pick
            today.
          </span>
        </div>
      </div>

      <div className="inputfield cityname px-8">
        <InputField
          name="city"
          label="City"
          value={values?.city}
          disabled={!props.isEditEnabled}
          pattern="^[a-zA-Z\s]*$"
          maxLength={100}
          onChange={onChange}
          placeholder="Enter your city name"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span className="font-size-13">
            Please share your location so we can be sure to invite you to in
            person events in your area!
          </span>
        </div>
      </div>

      <div className="flex px-8 py-4">
        <div className="inputfield w-[50%] pr-6">
          <InputField
            name="region"
            label="State or Province"
            value={values?.region}
            disabled={!props.isEditEnabled}
            pattern="^[a-zA-Z\s]*$"
            maxLength={100}
            onChange={onChange}
            placeholder="Enter state or province"
            className="custom-grey custom-outline-none border"
          />
        </div>
        <div className="inputfield w-[50%]">
          <InputField
            name="country"
            label="Country"
            pattern="^[a-zA-Z\s]*$"
            value={values?.country}
            disabled={!props.isEditEnabled}
            maxLength={100}
            onChange={onChange}
            placeholder="Enter country"
            className="custom-grey custom-outline-none border"
          />
        </div>
      </div>
    </>
  );
}
