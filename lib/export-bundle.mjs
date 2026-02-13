import { irToReactCode } from './ir.mjs';

function buildMockData(ir) {
  const dataContext = ir.screen?.dataContext || {};
  const states = ir.screen.states || [];
  const rows = Array.isArray(dataContext.tableRows) && dataContext.tableRows.length > 0
    ? dataContext.tableRows
    : [{ reservationId: 'R-240211-001', partnerName: '여기어때 파트너', status: 'pending', cancelReason: '고객요청' }];
  return `export const screenStates = ${JSON.stringify(states, null, 2)};

export const reservationRows = ${JSON.stringify(rows, null, 2)};
export const reservationMock = reservationRows[0];
`;
}

function buildHandlers(ir) {
  const endpoint = ir.screen?.dataContext?.endpoint || '/api/reservation/cancel-context';
  return `import { http, HttpResponse } from "msw";
import { reservationMock } from "./data";

export const handlers = [
  http.get("${endpoint}", () => {
    return HttpResponse.json({ ok: true, data: reservationMock });
  }),
  http.post("/api/reservation/cancel", async () => {
    return HttpResponse.json({ ok: true, toast: "취소가 완료되었습니다." });
  })
];
`;
}

function buildHook(ir) {
  const endpoint = ir.screen?.dataContext?.endpoint || '/api/reservation/cancel-context';
  return `import { useEffect, useState } from "react";

export function useCancelContext() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetch("${endpoint}")
      .then((res) => res.json())
      .then((json) => {
        if (!mounted) return;
        setData(json.data);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
}
`;
}

function buildMswBrowser() {
  return `import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
`;
}

function buildMainTsx() {
  return `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { worker } from "./mocks/browser";

async function bootstrap() {
  await worker.start({ onUnhandledRequest: "bypass" });
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
`;
}

function buildSectionComponents(ir) {
  const sections = ir.screen?.sections || {};
  const filterBar = sections.filterBar || [];
  const body = sections.body || [];
  const footer = sections.footer || [];
  const nodes = ir.nodes || [];
  const allComponents = Array.from(new Set(nodes.map((node) => node.component)));
  const nodePropsMap = Object.fromEntries(nodes.map((node) => [node.component, node.props || {}]));
  const dataContext = ir.screen?.dataContext || {};
  const selectorProps = nodePropsMap.YEO_Radio_Group || nodePropsMap.YEO_Dropdown || {};
  const dropdownOptions = Array.isArray(selectorProps.options) && selectorProps.options.length > 0
    ? selectorProps.options
    : ['옵션1', '옵션2'];
  const textAreaPlaceholder = nodePropsMap.YEO_TextArea?.placeholder || '상세 사유 입력';
  const inputPlaceholder = nodePropsMap.YEO_Input?.placeholder || '검색어 입력';
  const toastMessage = nodePropsMap.YEO_Toast?.message || '처리가 완료되었습니다.';
  const tableRows = Array.isArray(dataContext.tableRows) && dataContext.tableRows.length > 0
    ? dataContext.tableRows
    : [{ id: 'R-001', status: 'pending', partner: '여기어때 파트너' }];

  function renderOne(component, region = 'body') {
    if (component === 'YEO_Dropdown') return '<YEO_Dropdown value={reason} onChange={setReason} options={dropdownOptions} />';
    if (component === 'YEO_Radio_Group') return '<YEO_Radio_Group value={reason} onChange={setReason} options={dropdownOptions} />';
    if (component === 'YEO_TextArea') return `<YEO_TextArea value={detail} onChange={setDetail} placeholder="${textAreaPlaceholder}" />`;
    if (component === 'YEO_Input') return `<YEO_Input value={reason} onChange={setReason} placeholder="${inputPlaceholder}" />`;
    if (component === 'YEO_Table') return '<YEO_Table data={tableRows} />';
    if (component === 'YEO_Badge') return '<YEO_Badge>pending</YEO_Badge>';
    if (component === 'YEO_Button') {
      if (region === 'footer') return '<YEO_Button variant="primary" onClick={onSubmit} disabled={!reason}>완료</YEO_Button>';
      return '<YEO_Button variant="primary">실행</YEO_Button>';
    }
    return '';
  }

  const screenHeader = `import React from "react";
import { YEO_Modal } from "@yeo/ds-core";
import type { ScreenHeaderProps } from "../types/generated";

export function ScreenHeader({ open, title, children }: ScreenHeaderProps) {
  return open ? <YEO_Modal open={open} title={title}>{children}</YEO_Modal> : <>{children}</>;
}
`;

  const screenFilterBar = `import React from "react";
import { YEO_Button, YEO_Dropdown, YEO_Input } from "@yeo/ds-core";
import type { ScreenFilterBarProps } from "../types/generated";

export function ScreenFilterBar({ reason, setReason, dropdownOptions }: ScreenFilterBarProps) {
  return (
    <div className="mb-3 flex gap-2">
      ${filterBar.map((component) => renderOne(component, 'filter')).filter(Boolean).join('\n      ')}
    </div>
  );
}
`;

  const screenBody = `import React from "react";
import { YEO_Badge, YEO_Dropdown, YEO_Input, YEO_Radio_Group, YEO_Table, YEO_TextArea, YEO_Toast } from "@yeo/ds-core";
import type { ScreenBodyProps } from "../types/generated";

export function ScreenBody({ reason, setReason, detail, setDetail, tableRows, dropdownOptions }: ScreenBodyProps) {
  return (
    <div className="space-y-2">
      ${body.map((component) => renderOne(component, 'body')).filter(Boolean).join('\n      ')}
    </div>
  );
}
`;

  const screenFooter = `import React from "react";
import { YEO_Button } from "@yeo/ds-core";
import type { ScreenFooterProps } from "../types/generated";

export function ScreenFooter({ reason, onSubmit, onClose }: ScreenFooterProps) {
  return (
    <div className="mt-4 flex gap-2">
      ${footer.map((component) => renderOne(component, 'footer')).filter(Boolean).join('\n      ')}
      <YEO_Button variant="secondary" onClick={onClose}>닫기</YEO_Button>
    </div>
  );
}
`;

  const app = `import { useState } from "react";
import { YEO_Toast } from "@yeo/ds-core";
import { ScreenHeader } from "./components/ScreenHeader";
import { ScreenFilterBar } from "./components/ScreenFilterBar";
import { ScreenBody } from "./components/ScreenBody";
import { ScreenFooter } from "./components/ScreenFooter";
import type { TableRow } from "./types/generated";

const tableRows: TableRow[] = ${JSON.stringify(tableRows)};
const dropdownOptions = ${JSON.stringify(dropdownOptions)};

export default function App() {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [open, setOpen] = useState(true);
  const [showToast, setShowToast] = useState(false);

  const submit = () => {
    if (!reason) return;
    setShowToast(true);
    setOpen(false);
  };

  return (
    <div className="p-6">
      <ScreenHeader open={open} title="${ir.screen?.title || 'Generated Screen'}">
        ${(filterBar.length > 0) ? '<ScreenFilterBar reason={reason} setReason={setReason} dropdownOptions={dropdownOptions} />' : ''}
        <ScreenBody reason={reason} setReason={setReason} detail={detail} setDetail={setDetail} tableRows={tableRows} dropdownOptions={dropdownOptions} />
        <ScreenFooter reason={reason} onSubmit={submit} onClose={() => setOpen(false)} />
      </ScreenHeader>
      ${allComponents.includes('YEO_Toast') ? `{showToast ? <YEO_Toast message="${toastMessage}" /> : null}` : ''}
    </div>
  );
}
`;

  const types = `import type { ReactNode } from "react";

export type TableRow = Record<string, unknown>;

export interface ScreenHeaderProps {
  open: boolean;
  title: string;
  children: ReactNode;
}

export interface ScreenFilterBarProps {
  reason: string;
  setReason: (value: string) => void;
  dropdownOptions: string[];
}

export interface ScreenBodyProps {
  reason: string;
  setReason: (value: string) => void;
  detail: string;
  setDetail: (value: string) => void;
  tableRows: TableRow[];
  dropdownOptions: string[];
}

export interface ScreenFooterProps {
  reason: string;
  onSubmit: () => void;
  onClose: () => void;
}
`;

  return { app, screenHeader, screenFilterBar, screenBody, screenFooter, types };
}

function buildReadme(ir) {
  return `# Generated Screen Bundle

- title: ${ir.screen.title}
- states: ${(ir.screen.states || []).join(', ')}
- generatedBy: ds-copilot-demo

## Files

- App.tsx
- components/ScreenHeader.tsx
- components/ScreenFilterBar.tsx
- components/ScreenBody.tsx
- components/ScreenFooter.tsx
- hooks/useCancelContext.ts
- mocks/data.ts
- mocks/handlers.ts
- mocks/browser.ts
- main.tsx
`;
}

export function buildCodeBundle(ir) {
  const split = buildSectionComponents(ir);
  return {
    framework: 'react',
    styling: 'tailwind',
    files: {
      'src/App.tsx': split.app,
      'src/components/ScreenHeader.tsx': split.screenHeader,
      'src/components/ScreenFilterBar.tsx': split.screenFilterBar,
      'src/components/ScreenBody.tsx': split.screenBody,
      'src/components/ScreenFooter.tsx': split.screenFooter,
      'src/types/generated.ts': split.types,
      'src/App.single.tsx': irToReactCode(ir),
      'src/hooks/useCancelContext.ts': buildHook(ir),
      'src/mocks/data.ts': buildMockData(ir),
      'src/mocks/handlers.ts': buildHandlers(ir),
      'src/mocks/browser.ts': buildMswBrowser(),
      'src/main.tsx': buildMainTsx(),
      'README.generated.md': buildReadme(ir)
    }
  };
}
