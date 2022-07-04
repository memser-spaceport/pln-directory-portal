import { Meta, Story } from '@storybook/react';
import { Badge, BadgeProps } from './badge';

export default {
  component: Badge,
  title: 'Badge',
} as Meta;

const Template: Story<BadgeProps> = (args) => <Badge {...args} />;

export const Basic = Template.bind({});
Basic.args = {
  text: '100',
};
