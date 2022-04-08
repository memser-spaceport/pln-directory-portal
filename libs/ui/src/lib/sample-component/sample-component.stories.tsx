import { Story, Meta } from '@storybook/react';
import { SampleComponent, SampleComponentProps } from './sample-component';

export default {
  component: SampleComponent,
  title: 'SampleComponent',
} as Meta;

const Template: Story<SampleComponentProps> = (args) => (
  <SampleComponent {...args} />
);

export const Primary = Template.bind({});
Primary.args = {};
