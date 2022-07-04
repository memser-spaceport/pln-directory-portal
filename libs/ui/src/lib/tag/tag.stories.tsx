import { Meta, Story } from '@storybook/react';
import { Tag, TagProps } from './tag';

export default {
  component: Tag,
  title: 'Tag',
  argTypes: { onClick: { action: 'onClick' } },
} as Meta;

const Template: Story<TagProps> = (args) => <Tag {...args} />;

export const Basic = Template.bind({});
Basic.args = {
  value: 'Programming',
};

export const Selected = Template.bind({});
Selected.args = {
  ...Basic.args,
  selected: true,
};

export const Disabled = Template.bind({});
Disabled.args = {
  ...Basic.args,
  disabled: true,
};
