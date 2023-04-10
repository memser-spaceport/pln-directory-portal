import { InputField, ProfileImageUpload } from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function AddMemberBasicForm(props) {
  const values = props.formValues;
  const onChange = props.onChange;

  return (
    <>
      <div className="flex px-8 pt-3">
        <div className="profileImage">
          <ProfileImageUpload
            imageUrl={props.imageUrl}
            maxSize={4}
            onImageChange={props.handleImageChange}
          />
        </div>
        <div className="namefield inputfield">
          <InputField
            required = {true}
            name="name"
            label="Name"
            pattern="^[a-zA-Z\s]*$"
            maxLength={64}
            value={values?.name}
            onChange={onChange}
            placeholder="Enter your full name"
            className="border custom-grey custom-outline-none"
          />
        </div>
      </div>

      <div className="flex px-8 pt-3 text-sm text-gray-400">
        <div>
          <InformationCircleIcon className="h-5 w-5" />
        </div>
        <span className="font-size-13">
          Please upload a image in PNG or JPEG format with file size
          less that 4MB.
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
          onChange={onChange}
          onBlur={props.onEmailBlur}
          placeholder="Enter your email address"
          className="border custom-grey custom-outline-none"
        />
      </div>

      {props.emailExists && <span className="text-xs text-rose-600 px-8 py-1">Email already exists!</span>}

      <div className="px-8 py-4">
        <InputField
          name="plnStartDate"
          type="date"
          onChange={onChange}
          value={values?.plnStartDate}
          label="PLN Start Date"    
          className="border custom-grey custom-outline-none"
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
          pattern="^[a-zA-Z\s]*$"
          maxLength={100}
          onChange={onChange}
          placeholder="Enter your city name"
          className="border custom-grey custom-outline-none"
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
            pattern="^[a-zA-Z\s]*$"
            maxLength={100}
            onChange={onChange}
            placeholder="Enter state or province"
            className="border custom-grey custom-outline-none"
          />
        </div>
        <div className="inputfield w-[50%]">
          <InputField
            name="country"
            label="Country"
            pattern="^[a-zA-Z\s]*$"
            value={values?.country}
            maxLength={100}
            onChange={onChange}
            placeholder="Enter country"
            className="border custom-grey custom-outline-none"
          />
        </div>
      </div>
    </>
  );
}
