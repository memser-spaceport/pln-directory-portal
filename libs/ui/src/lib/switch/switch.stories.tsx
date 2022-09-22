import { Meta, Story } from '@storybook/react';
import { Switch, SwitchProps } from './switch';

export default {
  component: Switch,
  title: 'UI/Switch',
  argTypes: { onChange: { action: 'onChange' } },
} as Meta;

const Template: Story<SwitchProps> = (args) => <Switch {...args} />;

export const Basic = Template.bind({});
Basic.args = {};

export const WithLabel = Template.bind({});
WithLabel.args = {
  ...Basic.args,
  label: 'Show all',
};

export const Enabled = Template.bind({});
Enabled.args = {
  ...Basic.args,
  initialValue: true,
};
