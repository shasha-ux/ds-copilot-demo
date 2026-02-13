import type { Meta, StoryObj } from '@storybook/react';
import { YEO_Input } from '@yeo/ds-core';

const meta: Meta<typeof YEO_Input> = {
  title: 'Form/YEO_Input',
  component: YEO_Input,
  parameters: {
    figmaKey: 'SAMPLE_KEY_INPUT'
  },
  argTypes: {
    placeholder: { control: 'text' },
    value: { control: 'text' }
  }
};

export default meta;
export const Basic: StoryObj<typeof YEO_Input> = { args: { placeholder: '검색어 입력', value: '' } };
