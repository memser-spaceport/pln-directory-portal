import { InputField, ProfileImageUpload } from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function AddMemberBasicForm(props) {
  const values = props.formValues;
  const onChange = props.onChange;

  return (
    <>
      <div className="flex px-8 py-4">
        <div className="basis-1/4">
          <ProfileImageUpload
            imageUrl={props.imageUrl}
            maxSize={4}
            onImageChange={props.handleImageChange}
          />
        </div>
        <div className="basis-3/4 pl-1">
          <InputField
            required
            name="name"
            label="Name"
            value={values?.name}
            onChange={onChange}
            placeholder="Enter your full name"
          />
        </div>
      </div>

      <div className="flex px-8 text-sm text-gray-400">
        <div>
          <InformationCircleIcon className="h-5 w-5" />
        </div>
        <span>Please upload a squared image in PNG or JPEG format only</span>
      </div>

      <div className="px-8 py-4">
        <InputField
          required
          name="email"
          type="email"
          label="Email"
          value={values?.email}
          onChange={onChange}
          placeholder="Enter your email address"
        />
      </div>

      <div className="px-8 py-4">
        <InputField
          name="plnStartDate"
          type="date"
          onChange={onChange}
          value={values?.plnStartDate}
          label="PLN Start Date"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            What date did your team join the PLN? If you don&apos;t know, pick
            today.
          </span>
        </div>
      </div>

      <div className="px-8 py-4">
        <InputField
          name="city"
          label="City"
          value={values?.city}
          onChange={onChange}
          placeholder="Enter your city name"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            Please share your location so we can be sure to invite you to in
            person events in your area!
          </span>
        </div>
      </div>

      <div className="flex">
        <div className="px-8 py-4">
          <InputField
            name="region"
            label="State or Province"
            value={values?.region}
            onChange={onChange}
            placeholder="Enter state or province name"
          />
        </div>
        <div className="px-8 py-4">
          <InputField
            name="country"
            label="Country"
            value={values?.country}
            onChange={onChange}
            placeholder="Enter country name"
          />
        </div>
      </div>
    </>
  );
}
