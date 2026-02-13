import type { Meta, StoryObj } from '@storybook/react';
import { YEO_Toast } from '@yeo/ds-core';

const meta: Meta<typeof YEO_Toast> = {
  title: 'Feedback/YEO_Toast',
  component: YEO_Toast,
  parameters: {
    figmaKey: 'SAMPLE_KEY_TOAST'
  },
  argTypes: {
    message: { control: 'text' },
    type: { control: 'select' }
  }
};

export default meta;
export const Success: StoryObj<typeof YEO_Toast> = { args: { message: '저장되었습니다', type: 'success' } };
