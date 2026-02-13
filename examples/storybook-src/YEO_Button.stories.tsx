import type { Meta, StoryObj } from '@storybook/react';
import { YEO_Button } from '@yeo/ds-core';

const meta: Meta<typeof YEO_Button> = {
  title: 'Core/YEO_Button',
  component: YEO_Button,
  parameters: {
    figmaKey: 'SAMPLE_KEY_BUTTON'
  },
  argTypes: {
    variant: { control: 'select' },
    size: { control: 'select' },
    disabled: { control: 'boolean' }
  }
};

export default meta;
export const Primary: StoryObj<typeof YEO_Button> = { args: { variant: 'primary' } };
