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
            required
            name="name"
            label="Name"
            value={values?.name}
            onChange={onChange}
            placeholder="Enter your full name"
            className="border-1 border-gray-300"
          />
        </div>
      </div>

      <div className="flex px-8 pt-3 text-sm text-gray-400">
        <div>
          <InformationCircleIcon className="h-5 w-5" />
        </div>
        <span className="font-size-13">
          Please upload a squared image in PNG or JPEG format with file size
          less that 4MB.
        </span>
      </div>

      <div className="inputfield px-8 py-4">
        <InputField
          required
          name="email"
          type="email"
          label="Email"
          value={values?.email}
          onChange={onChange}
          placeholder="Enter your email address"
          className="border-1 border-gray-300"
        />
      </div>

      <div className="inputfield datefield px-8 py-4">
        <InputField
          name="plnStartDate"
          type="date"
          onChange={onChange}
          value={values?.plnStartDate}
          label="PLN Start Date"
          className="border-1 border-gray-300"
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

      <div className="inputfield cityname px-8 py-4">
        <InputField
          name="city"
          label="City"
          value={values?.city}
          onChange={onChange}
          placeholder="Enter your city name"
          className="border-1 border-gray-300"
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
            onChange={onChange}
            placeholder="Enter state or province name"
            className="border-1 border-gray-300"
          />
        </div>
        <div className="inputfield w-[50%]">
          <InputField
            name="country"
            label="Country"
            value={values?.country}
            onChange={onChange}
            placeholder="Enter country name"
            className="border-1 border-gray-300"
          />
        </div>
      </div>
    </>
  );
}
