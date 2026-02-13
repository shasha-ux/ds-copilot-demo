import type { Meta, StoryObj } from '@storybook/react';
import { YEO_Table } from '@yeo/ds-core';

const meta: Meta<typeof YEO_Table> = {
  title: 'Data/YEO_Table',
  component: YEO_Table,
  parameters: {
    figmaKey: 'SAMPLE_KEY_TABLE'
  },
  argTypes: {
    columns: { control: 'object' },
    data: { control: 'object' }
  }
};

export default meta;
export const Basic: StoryObj<typeof YEO_Table> = {
  args: {
    columns: ['예약번호', '파트너명', '상태'],
    data: [{ id: 'R-1001', partner: '강남점', status: 'pending' }]
  }
};
