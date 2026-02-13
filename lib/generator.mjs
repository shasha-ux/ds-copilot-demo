import fs from 'node:fs';
import { irToReactCode, planToIR } from './ir.mjs';
import { extractDataContext } from './data-context.mjs';

export function loadRegistry(registryPath) {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function normalizeFidelity(prompt = '', input = '') {
  const candidate = String(input || '').toLowerCase().trim();
  if (candidate === 'lowfi' || candidate === 'prototype' || candidate === 'hifi') {
    return candidate;
  }
  const lower = String(prompt || '').toLowerCase();
  if (lower.includes('로우파이') || lower.includes('lowfi')) return 'lowfi';
  if (lower.includes('하이파이') || lower.includes('hifi')) return 'hifi';
  return 'prototype';
}

function dedupe(list) {
  return Array.from(new Set(list));
}

export function buildPlan(prompt, schema, registry, options = {}) {
  const lower = (prompt || '').toLowerCase();
  const fidelity = normalizeFidelity(prompt, options.fidelity);
  const isCancelFlow = /취소|cancel/.test(lower);
  const isListFlow = /리스트|list|table/.test(lower);
  const isErrorHeavy = /error|예외|에러|실패|fallback/.test(lower);
  const wantsCardLayout = /card|카드/.test(lower);
  const hasEnum = /enum|상태|사유|type/.test((schema || '').toLowerCase());
  const contextHints = options.contextHints || {};
  const dataContext = extractDataContext(schema);

  const title = isCancelFlow ? '예약 취소 팝업' : isListFlow ? '예약 리스트 화면' : '파트너센터 신규 화면';

  const components = [];
  const componentProps = {};
  const reasoning = [];

  if (isCancelFlow) {
    components.push('YEO_Modal', hasEnum ? 'YEO_Radio_Group' : 'YEO_Dropdown', 'YEO_TextArea', 'YEO_Button', 'YEO_Toast');
    const reasonOptions = dataContext.options.cancelReason;
    const selectorName = hasEnum ? 'YEO_Radio_Group' : 'YEO_Dropdown';
    componentProps[selectorName] = { options: reasonOptions, value: reasonOptions[0] || '' };
    componentProps.YEO_TextArea = { placeholder: '상세 사유 입력', maxLength: 300 };
    componentProps.YEO_Button = { variant: 'primary', disabled: false };
    componentProps.YEO_Toast = { message: '취소가 완료되었습니다.' };
    reasoning.push('요청 문구에 취소 플로우가 포함되어 모달 패턴을 기본으로 선택했습니다.');
    reasoning.push(hasEnum
      ? '사유 선택은 옵션 탐색 속도를 위해 라디오 그룹을 우선 추천했습니다.'
      : '사유 옵션 정보가 불명확해 드롭다운으로 시작하고 이후 상세 데이터로 교체하도록 구성했습니다.');
  } else if (isListFlow) {
    components.push('YEO_Table', 'YEO_Badge', 'YEO_Dropdown', 'YEO_Button');
    componentProps.YEO_Dropdown = {
      placeholder: '상태 필터',
      options: dataContext.options.status,
      value: dataContext.options.status[0] || ''
    };
    componentProps.YEO_Button = { variant: 'primary' };
    reasoning.push('리스트/테이블 의도가 명확하여 데이터 조회 패턴을 사용했습니다.');
  } else {
    components.push('YEO_Input', 'YEO_Button', 'YEO_Table');
    componentProps.YEO_Input = { placeholder: '검색어 입력' };
    componentProps.YEO_Button = { variant: 'primary' };
    reasoning.push('요구사항이 일반형이어서 입력-결과 기본 패턴으로 생성했습니다.');
  }

  if (contextHints.hasTableIntent && !components.includes('YEO_Table')) {
    components.push('YEO_Table');
    reasoning.push('기획 문서에서 목록/테이블 의도가 감지되어 Table 컴포넌트를 보강했습니다.');
  }
  if (contextHints.hasDataPolicy && !components.includes('YEO_Badge')) {
    components.push('YEO_Badge');
    reasoning.push('기획 문서의 상태/정책 키워드를 기반으로 상태 배지를 보강했습니다.');
  }
  if (wantsCardLayout) {
    components.push('YEO_Badge');
    reasoning.push('카드 전환 요청이 있어 상태 강조 배지를 추가해 카드 패턴 대응을 준비했습니다.');
  }
  if (isErrorHeavy && !components.includes('YEO_Toast')) {
    components.push('YEO_Toast');
    reasoning.push('에러/예외 시나리오 요청이 있어 피드백 토스트를 포함했습니다.');
  }

  if (fidelity === 'lowfi') {
    if (isCancelFlow) {
      const baseSelector = hasEnum ? 'YEO_Radio_Group' : 'YEO_Dropdown';
      components.length = 0;
      components.push('YEO_Modal', baseSelector, 'YEO_Button');
      delete componentProps.YEO_TextArea;
      delete componentProps.YEO_Toast;
      reasoning.push('로우파이 모드로 상세 입력/피드백 컴포넌트를 축소해 화면 구조 검증에 집중했습니다.');
    } else if (isListFlow) {
      components.length = 0;
      components.push('YEO_Table', 'YEO_Dropdown', 'YEO_Button');
      delete componentProps.YEO_Badge;
      reasoning.push('로우파이 모드로 핵심 탐색 경로(필터+테이블)만 유지했습니다.');
    } else {
      components.length = 0;
      components.push('YEO_Input', 'YEO_Button');
      reasoning.push('로우파이 모드로 입력/액션 최소 셋만 유지했습니다.');
    }
  }

  if (fidelity === 'hifi') {
    if (isCancelFlow) {
      components.push('YEO_Table', 'YEO_Badge');
      reasoning.push('하이파이 모드로 관련 데이터 컨텍스트(테이블/상태배지)를 추가했습니다.');
    } else if (isListFlow) {
      components.push('YEO_Input');
      reasoning.push('하이파이 모드로 필터 입력을 보강해 운영 시나리오를 확장했습니다.');
    } else {
      components.push('YEO_Dropdown');
      reasoning.push('하이파이 모드로 다중 조건 필터 패턴을 보강했습니다.');
    }
  }

  const resolvedComponents = dedupe(components);

  const patternStrategy = registry.pattern_strategy || {};
  const rowTargets = registry.layout_strategy?.row_group_components || ['YEO_Button'];
  const sections = { header: [], body: [], footer: [], filterBar: [] };

  if (patternStrategy.table_filter_bar && resolvedComponents.includes('YEO_Table')) {
    const filterTargets = patternStrategy.table_filter_components || ['YEO_Input', 'YEO_Dropdown', 'YEO_Button'];
    sections.filterBar = filterTargets.filter((name) => resolvedComponents.includes(name));
  }

  if (patternStrategy.modal_footer_actions && resolvedComponents.includes('YEO_Modal')) {
    for (const name of resolvedComponents) {
      if (name === 'YEO_Modal') {
        sections.header.push(name);
      } else if (rowTargets.includes(name)) {
        sections.footer.push(name);
      } else {
        sections.body.push(name);
      }
    }
  } else {
    sections.body = [...resolvedComponents];
  }

  const proposed = [];
  if (wantsCardLayout && !registry.components.includes('YEO_Card')) {
    proposed.push({
      name: 'YEO_Card',
      reason: '카드형 레이아웃 요청이 있으나 현재 DS 등록 컴포넌트 목록에 없습니다.',
      status: 'Proposed'
    });
  }

  return {
    title,
    fidelity,
    previewDensity: fidelity === 'lowfi' ? 'coarse' : fidelity === 'hifi' ? 'detailed' : 'balanced',
    components: resolvedComponents,
    componentProps,
    sections,
    states: registry.state_variants_required,
    reasoning,
    businessRules: [
      '취소 사유를 선택해야 완료 버튼이 활성화됩니다.',
      '기타 사유 선택 시 상세 입력창이 필수로 표시됩니다.',
      '완료 시 토스트 메시지와 함께 리스트를 새로고침합니다.'
    ],
    routeMap: [
      { action: '완료 클릭', to: '예약 리스트', guard: 'validation_passed' },
      { action: '닫기 클릭', to: '현재 화면', guard: 'always' }
    ],
    dataContext,
    contextSummary: {
      confluence: options.contextUrl || null,
      selectionContext: options.selectionContext ? 'included' : 'none',
      editInstruction: options.editInstruction || '',
      signals: contextHints
    },
    proposed
  };
}

export function validatePlan(plan, registry) {
  const issues = [];

  for (const component of plan.components) {
    if (!registry.components.includes(component)) {
      issues.push({
        severity: 'New',
        item: component,
        message: '디자인시스템 미등록 컴포넌트입니다. Proposed 후보로 등록하세요.'
      });
    }
  }

  for (const state of registry.state_variants_required) {
    if (!plan.states.includes(state)) {
      issues.push({
        severity: 'Critical',
        item: state,
        message: '필수 상태 변이가 누락되었습니다.'
      });
    }
  }

  if (!plan.components.includes('YEO_Button')) {
    issues.push({
      severity: 'Major',
      item: 'action',
      message: '주요 액션 버튼이 없어 기본 완료 경로가 불명확합니다.'
    });
  }

  return issues;
}

export function buildFigmaEvents(plan, registry) {
  return {
    onDesignRequest: {
      selection: { x: 120, y: 80, width: 960, height: 640 },
      promptSummary: plan.title,
      targetOutput: plan.fidelity || 'prototype'
    },
    onAssetValidation: {
      ruleSet: registry.rule_set_name,
      registryVersion: registry.version,
      componentCount: plan.components.length
    },
    onCodeExport: {
      framework: 'react',
      styling: 'tailwind',
      dsPackage: '@yeo/ds-core',
      stateVariants: plan.states
    }
  };
}

export function buildReactCode(plan) {
  return irToReactCode(planToIR(plan));
}
