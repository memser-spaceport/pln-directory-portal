import { Meta, Story } from '@storybook/react';
import { Breadcrumb, BreadcrumbProps } from './breadcrumb';

export default {
  component: Breadcrumb,
  title: 'UI/Breadcrumb',
} as Meta;

const Template: Story<BreadcrumbProps> = (args) => <Breadcrumb {...args} />;

export const Basic = Template.bind({});
Basic.args = {
  items: [
    { label: 'Item With Link', href: '/' },
    { label: 'Item Without Link' },
    { label: 'Another Item With Link', href: '/' },
    { label: 'Current Page' },
  ],
};
