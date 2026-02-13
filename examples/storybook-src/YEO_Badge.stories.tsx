import type { Meta, StoryObj } from '@storybook/react';
import { YEO_Badge } from '@yeo/ds-core';

const meta: Meta<typeof YEO_Badge> = {
  title: 'Data/YEO_Badge',
  component: YEO_Badge,
  parameters: {
    figmaKey: 'SAMPLE_KEY_BADGE'
  },
  argTypes: {
    status: { control: 'select' },
    label: { control: 'text' }
  }
};

export default meta;
export const Pending: StoryObj<typeof YEO_Badge> = { args: { status: 'pending', label: '대기' } };
