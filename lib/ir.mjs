export function planToIR(plan) {
  return {
    schemaVersion: '0.1.0',
    screen: {
      title: plan.title,
      fidelity: plan.fidelity || 'prototype',
      previewDensity: plan.previewDensity || 'balanced',
      states: plan.states,
      businessRules: plan.businessRules,
      routeMap: plan.routeMap,
      sections: plan.sections || null,
      dataContext: plan.dataContext || null
    },
    nodes: plan.components.map((name, idx) => ({
      id: `node_${idx + 1}`,
      component: name,
      props: (plan.componentProps && plan.componentProps[name]) ? plan.componentProps[name] : {}
    }))
  };
}

export function irToReactCode(ir) {
  const components = Array.from(new Set((ir.nodes || []).map((node) => node.component)));
  const nodePropsMap = Object.fromEntries((ir.nodes || []).map((node) => [node.component, node.props || {}]));
  const sections = ir.screen?.sections || {};
  const defaultBody = components.filter((name) => name !== 'YEO_Modal');
  const body = Array.isArray(sections.body) && sections.body.length > 0 ? sections.body : defaultBody;
  const footer = Array.isArray(sections.footer) ? sections.footer : [];
  const filterBar = Array.isArray(sections.filterBar) ? sections.filterBar : [];
  const hasModal = components.includes('YEO_Modal');
  const hasToast = components.includes('YEO_Toast');
  const dataContext = ir.screen?.dataContext || {};
  const tableRows = Array.isArray(dataContext.tableRows) && dataContext.tableRows.length > 0
    ? dataContext.tableRows
    : [{ id: 'R-001', status: 'pending', partner: '여기어때 파트너' }];

  const imports = components.filter(Boolean);
  if (!imports.includes('YEO_Button')) {
    imports.push('YEO_Button');
  }

  function renderComponent(component, region) {
    const props = nodePropsMap[component] || {};
    if (component === 'YEO_Dropdown') {
      const options = Array.isArray(props.options) && props.options.length > 0
        ? props.options
        : dataContext?.options?.status || ['옵션1', '옵션2'];
      return `<YEO_Dropdown value={reason} onChange={setReason} options={${JSON.stringify(options)}} />`;
    }
    if (component === 'YEO_Radio_Group') {
      const options = Array.isArray(props.options) && props.options.length > 0
        ? props.options
        : dataContext?.options?.cancelReason || ['옵션1', '옵션2'];
      return `<YEO_Radio_Group value={reason} onChange={setReason} options={${JSON.stringify(options)}} />`;
    }
    if (component === 'YEO_TextArea') {
      return `<YEO_TextArea value={detail} onChange={setDetail} placeholder="${props.placeholder || '상세 사유 입력'}" />`;
    }
    if (component === 'YEO_Input') {
      return `<YEO_Input value={reason} onChange={setReason} placeholder="${props.placeholder || '검색어 입력'}" />`;
    }
    if (component === 'YEO_Button') {
      if (region === 'footer') {
        return `<YEO_Button variant="primary" onClick={submit} disabled={!reason}>완료</YEO_Button>`;
      }
      return `<YEO_Button variant="${props.variant || 'primary'}">실행</YEO_Button>`;
    }
    if (component === 'YEO_Table') {
      return `<YEO_Table data={tableRows} />`;
    }
    if (component === 'YEO_Badge') {
      return `<YEO_Badge>pending</YEO_Badge>`;
    }
    if (component === 'YEO_Toast') {
      return '';
    }
    if (component === 'YEO_Modal') {
      return '';
    }
    return `<div>${component}</div>`;
  }

  const filterBarJsx = filterBar.length > 0
    ? `<div className="mb-3 flex gap-2">\n          ${filterBar.map((component) => renderComponent(component, 'filter')).filter(Boolean).join('\n          ')}\n        </div>`
    : '';
  const bodyJsx = body.map((component) => renderComponent(component, 'body')).filter(Boolean).join('\n        ');
  const footerJsx = footer.length > 0
    ? `<div className="mt-4 flex gap-2">\n          ${footer.map((component) => renderComponent(component, 'footer')).filter(Boolean).join('\n          ')}\n          <YEO_Button variant="secondary" onClick={() => setOpen(false)}>닫기</YEO_Button>\n        </div>`
    : '';

  return `import { useState } from "react";
import {
  ${imports.join(',\n  ')}
} from "@yeo/ds-core";

const tableRows = [
  ${JSON.stringify(tableRows[0] || { id: 'R-001', status: 'pending', partner: '여기어때 파트너' })}
];

export default function GeneratedScreen() {
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
      ${hasModal ? `<YEO_Modal open={open} title="${ir.screen?.title || 'Generated Screen'}">` : '<div className="border rounded-xl p-4">'}
        ${filterBarJsx}
        ${bodyJsx}
        ${footerJsx}
      ${hasModal ? '</YEO_Modal>' : '</div>'}
      ${hasToast ? '{showToast ? <YEO_Toast message="취소가 완료되었습니다." /> : null}' : ''}
    </div>
  );
}
`;
}
