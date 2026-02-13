import type { Meta, StoryObj } from '@storybook/react';
import { YEO_Dropdown } from '@yeo/ds-core';

const meta: Meta<typeof YEO_Dropdown> = {
  title: 'Form/YEO_Dropdown',
  component: YEO_Dropdown,
  parameters: {
    figmaKey: 'SAMPLE_KEY_DROPDOWN'
  },
  argTypes: {
    options: { control: 'object' },
    value: { control: 'text' }
  }
};

export default meta;
export const Basic: StoryObj<typeof YEO_Dropdown> = { args: { options: ['오늘', '지난 7일', '지난 30일'], value: '오늘' } };
