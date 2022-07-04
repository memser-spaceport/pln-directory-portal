import { Meta, Story } from '@storybook/react';
import { Dropdown, DropdownProps, IDropdownOption } from './dropdown';

export default {
  component: Dropdown,
  title: 'Dropdown',
  argTypes: { onChange: { action: 'onChange' } },
} as Meta;

const Template: Story<DropdownProps> = (args) => <Dropdown {...args} />;

const dropdownOptions: IDropdownOption[] = [
  { label: 'Portugal', value: 'pt' },
  { label: 'Spain', value: 'es' },
  { label: 'United Kingdom', value: 'uk' },
  { label: 'United States of America', value: 'us' },
];

export const Basic = Template.bind({});
Basic.args = {
  options: dropdownOptions,
};
