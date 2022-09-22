import { SearchIcon } from '@heroicons/react/outline';
import { Meta, Story } from '@storybook/react';
import { InputField, InputFieldProps } from './input-field';

export default {
  component: InputField,
  title: 'UI/Input Field',
  argTypes: { onClear: { action: 'onClear' } },
} as Meta;

const Template: Story<InputFieldProps> = (args) => <InputField {...args} />;

export const Basic = Template.bind({});
Basic.args = {
  label: 'Name',
};

export const Complete = Template.bind({});
Complete.args = {
  label: 'Name',
  icon: SearchIcon,
  hasClear: true,
  defaultValue: 'John Doe',
  placeholder: 'Name',
};
