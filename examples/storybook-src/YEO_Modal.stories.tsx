import type { Meta, StoryObj } from '@storybook/react';
import { YEO_Modal } from '@yeo/ds-core';

const meta: Meta<typeof YEO_Modal> = {
  title: 'Overlay/YEO_Modal',
  component: YEO_Modal,
  parameters: {
    figmaKey: 'SAMPLE_KEY_MODAL'
  },
  argTypes: {
    open: { control: 'boolean' },
    title: { control: 'text' }
  }
};

export default meta;
export const Basic: StoryObj<typeof YEO_Modal> = { args: { open: true, title: '타이틀' } };
