import { PlusCircleIcon } from '@heroicons/react/solid';
import { Meta, Story } from '@storybook/react';
import { Tooltip, TooltipProps } from './tooltip';

export default {
  component: Tooltip,
  title: 'Tooltip',
  argTypes: {
    Trigger: {
      table: {
        disable: true,
      },
    },
  },
} as Meta;

const TriggerIcon = () => {
  return <PlusCircleIcon className="h-4 w-4" />;
};

const Template: Story<TooltipProps> = (args) => (
  <div className="flex h-52 flex-wrap justify-between">
    <div className="flex h-1/3 w-1/3 items-start justify-start">
      <Tooltip Trigger={args.Trigger}>{args.children}</Tooltip>
    </div>
    <div className="flex h-1/3 w-1/3 flex-wrap items-center justify-center">
      <Tooltip Trigger={args.Trigger}>{args.children}</Tooltip>
    </div>
    <div className="flex h-1/3 w-1/3 items-end justify-end">
      <Tooltip Trigger={args.Trigger}>{args.children}</Tooltip>
    </div>
  </div>
);

export const Basic = Template.bind({});
Basic.args = {
  Trigger: TriggerIcon,
  children: 'Lorem Ipsum',
};
