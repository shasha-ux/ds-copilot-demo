import type { Meta, StoryObj } from '@storybook/react';
import { YEO_TextArea } from '@yeo/ds-core';

const meta: Meta<typeof YEO_TextArea> = {
  title: 'Form/YEO_TextArea',
  component: YEO_TextArea,
  parameters: {
    figmaKey: 'SAMPLE_KEY_TEXTAREA'
  },
  argTypes: {
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' }
  }
};

export default meta;
export const Basic: StoryObj<typeof YEO_TextArea> = { args: { placeholder: '상세 사유 입력' } };
