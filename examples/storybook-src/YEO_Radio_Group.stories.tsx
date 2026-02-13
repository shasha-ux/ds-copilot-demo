import type { Meta, StoryObj } from '@storybook/react';
import { YEO_Radio_Group } from '@yeo/ds-core';

const meta: Meta<typeof YEO_Radio_Group> = {
  title: 'Form/YEO_Radio_Group',
  component: YEO_Radio_Group,
  parameters: {
    figmaKey: 'SAMPLE_KEY_RADIO_GROUP'
  },
  argTypes: {
    options: { control: 'object' },
    value: { control: 'text' }
  }
};

export default meta;
export const Basic: StoryObj<typeof YEO_Radio_Group> = { args: { options: ['고객요청', '중복예약', '기타'], value: '고객요청' } };
