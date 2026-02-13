figma.showUI(__html__, { width: 420, height: 760 });

function selectedFrameBounds() {
  const node = figma.currentPage.selection[0];
  if (!node || !('x' in node && 'y' in node && 'width' in node && 'height' in node)) {
    return { x: 80, y: 80, width: 960, height: 640 };
  }
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function summarizeSelectionContext(limit = 40) {
  const node = figma.currentPage.selection[0];
  if (!node) return '선택된 프레임이 없습니다.';
  const lines = [`선택 노드: ${node.name}`];
  if ('children' in node && Array.isArray(node.children)) {
    const preview = node.children.slice(0, limit);
    for (const child of preview) {
      let text = '';
      if (child.type === 'TEXT' && typeof child.characters === 'string') {
        text = child.characters.replace(/\s+/g, ' ').trim().slice(0, 40);
      }
      lines.push(`${child.type}:${child.name}${text ? ` -> ${text}` : ''}`);
    }
    if (node.children.length > preview.length) {
      lines.push(`... +${node.children.length - preview.length}개`);
    }
  }
  return lines.join('\n').slice(0, 2000);
}

async function createText(content, size = 14) {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  const node = figma.createText();
  node.characters = content;
  node.fontSize = size;
  return node;
}

async function createFallbackComponentChip(name) {
  const chip = figma.createFrame();
  chip.layoutMode = 'HORIZONTAL';
  chip.counterAxisSizingMode = 'AUTO';
  chip.primaryAxisSizingMode = 'AUTO';
  chip.paddingLeft = 8;
  chip.paddingRight = 8;
  chip.paddingTop = 6;
  chip.paddingBottom = 6;
  chip.cornerRadius = 6;
  chip.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.96, b: 0.98 } }];
  chip.strokes = [{ type: 'SOLID', color: { r: 0.82, g: 0.86, b: 0.9 } }];
  chip.strokeWeight = 1;
  chip.appendChild(await createText(name, 12));
  return chip;
}

function normalizeFidelity(value) {
  const lower = String(value || '').toLowerCase();
  if (lower === 'lowfi' || lower === 'hifi' || lower === 'prototype') return lower;
  return 'prototype';
}

function profileForFidelity(fidelity) {
  if (fidelity === 'lowfi') {
    return {
      frameSpacing: 8,
      framePadding: 20,
      showFullStates: false,
      maxStates: 2,
      includeRouteMap: false,
      includeReasoning: false,
      includeCompliance: false
    };
  }
  if (fidelity === 'hifi') {
    return {
      frameSpacing: 14,
      framePadding: 24,
      showFullStates: true,
      maxStates: 99,
      includeRouteMap: true,
      includeReasoning: true,
      includeCompliance: true
    };
  }
  return {
    frameSpacing: 12,
    framePadding: 24,
    showFullStates: true,
    maxStates: 99,
    includeRouteMap: true,
    includeReasoning: false,
    includeCompliance: false
  };
}

function filterComponentsForFidelity(components, fidelity) {
  const list = Array.isArray(components) ? components : [];
  if (fidelity !== 'lowfi') return list;
  return list.filter((name) => !['YEO_Toast', 'YEO_Badge'].includes(name));
}

function filterSectionsForFidelity(sections, fidelity) {
  const header = sections && Array.isArray(sections.header) ? sections.header : [];
  const filterBar = sections && Array.isArray(sections.filterBar) ? sections.filterBar : [];
  const body = sections && Array.isArray(sections.body) ? sections.body : [];
  const footer = sections && Array.isArray(sections.footer) ? sections.footer : [];
  const safe = {
    header: [...header],
    filterBar: [...filterBar],
    body: [...body],
    footer: [...footer]
  };
  if (fidelity !== 'lowfi') return safe;

  safe.body = safe.body.filter((name) => !['YEO_Toast', 'YEO_Badge', 'YEO_Table'].includes(name));
  safe.filterBar = safe.filterBar.filter((name) => name !== 'YEO_Button');
  return safe;
}

function applyLayoutRule(node, componentName, componentLayouts) {
  const rule = componentLayouts && componentLayouts[componentName];
  if (!rule || !node) return;

  const minWidth = Number(rule.minWidth || 0);
  const fixedHeight = Number(rule.fixedHeight || 0);
  const layoutGrow = Number(rule.layoutGrow || 0);

  try {
    if ('layoutGrow' in node) {
      node.layoutGrow = layoutGrow;
      node.layoutAlign = layoutGrow > 0 ? 'STRETCH' : 'INHERIT';
    }
  } catch (e) {
    // ignore layoutGrow failures for incompatible nodes
  }

  try {
    if ('resize' in node) {
      const targetWidth = minWidth > 0 ? minWidth : ('width' in node ? node.width : 200);
      const targetHeight = fixedHeight > 0 ? fixedHeight : ('height' in node ? node.height : 40);
      node.resize(targetWidth, targetHeight);
    }
  } catch (e) {
    // ignore resize failures for auto-sized instances
  }
}

function findVariantKey(componentProperties, candidate) {
  if (!componentProperties) return null;
  const keys = Object.keys(componentProperties);
  return keys.find((key) => key.toLowerCase().includes(candidate.toLowerCase())) || null;
}

function applyInstanceProps(instance, props) {
  if (!instance || !props) return;
  if (typeof instance.setProperties !== 'function' || !instance.componentProperties) return;

  const next = {};
  const variantKey = findVariantKey(instance.componentProperties, 'variant');
  const sizeKey = findVariantKey(instance.componentProperties, 'size');

  if (variantKey && props.variant) {
    next[variantKey] = String(props.variant);
  }
  if (sizeKey && props.size) {
    next[sizeKey] = String(props.size);
  }

  if (Object.keys(next).length > 0) {
    try {
      instance.setProperties(next);
    } catch (e) {
      // keep default instance props if provided value is invalid
    }
  }
}

function isActionComponent(componentName, layoutStrategy) {
  return Boolean(
    layoutStrategy &&
    Array.isArray(layoutStrategy.action_components) &&
    layoutStrategy.action_components.includes(componentName)
  );
}

function shouldStretchComponent(componentName, layoutStrategy) {
  return Boolean(
    layoutStrategy &&
    Array.isArray(layoutStrategy.stretch_components) &&
    layoutStrategy.stretch_components.includes(componentName)
  );
}

async function createComponentNode(componentName, componentKeys, componentProps, componentLayouts) {
  const key = componentKeys && componentKeys[componentName];
  if (!key) {
    const fallback = await createFallbackComponentChip(componentName);
    applyLayoutRule(fallback, componentName, componentLayouts);
    return fallback;
  }

  try {
    const component = await figma.importComponentByKeyAsync(key);
    const instance = component.createInstance();
    instance.name = componentName;
    applyInstanceProps(instance, componentProps && componentProps[componentName]);
    applyLayoutRule(instance, componentName, componentLayouts);
    return instance;
  } catch (e) {
    const fallback = await createFallbackComponentChip(`${componentName} (fallback)`);
    applyLayoutRule(fallback, componentName, componentLayouts);
    return fallback;
  }
}

function splitModalSections(components, layoutStrategy) {
  const rowTargets = layoutStrategy && Array.isArray(layoutStrategy.row_group_components)
    ? layoutStrategy.row_group_components
    : ['YEO_Button'];
  const body = [];
  const footerActions = [];
  for (const name of components) {
    if (rowTargets.includes(name)) {
      footerActions.push(name);
    } else {
      body.push(name);
    }
  }
  return { body, footerActions };
}

async function buildStructuredNodes(structure, components, options) {
  const { componentKeys, componentProps, componentLayouts, layoutStrategy, patternStrategy } = options;
  const rowTargets = layoutStrategy && Array.isArray(layoutStrategy.row_group_components)
    ? layoutStrategy.row_group_components
    : ['YEO_Button'];
  const columnSpacing = Number(layoutStrategy && layoutStrategy.column_item_spacing || 8);
  const rowSpacing = Number(layoutStrategy && layoutStrategy.row_item_spacing || 8);

  structure.itemSpacing = columnSpacing;

  if (patternStrategy && patternStrategy.table_filter_bar && components.includes('YEO_Table')) {
    const filterComponents = patternStrategy && Array.isArray(patternStrategy.table_filter_components)
      ? patternStrategy.table_filter_components
      : ['YEO_Input', 'YEO_Dropdown', 'YEO_Button'];
    const filterRow = figma.createFrame();
    filterRow.name = 'Filter Bar';
    filterRow.layoutMode = 'HORIZONTAL';
    filterRow.itemSpacing = rowSpacing;
    filterRow.fills = [];
    filterRow.layoutAlign = 'STRETCH';

    for (const comp of filterComponents) {
      if (components.includes(comp)) {
        filterRow.appendChild(await createComponentNode(comp, componentKeys, componentProps, componentLayouts));
      }
    }
    if (filterRow.children.length > 0) {
      structure.appendChild(filterRow);
    }
  }

  const modalMode = Boolean(patternStrategy && patternStrategy.modal_footer_actions && components.includes('YEO_Modal'));
  if (modalMode) {
    const { body, footerActions } = splitModalSections(components.filter((c) => c !== 'YEO_Modal'), layoutStrategy);

    const modalShell = figma.createFrame();
    modalShell.name = 'Modal Body';
    modalShell.layoutMode = 'VERTICAL';
    modalShell.itemSpacing = columnSpacing;
    modalShell.fills = [];
    modalShell.layoutAlign = 'STRETCH';

    for (const comp of body) {
      modalShell.appendChild(await createComponentNode(comp, componentKeys, componentProps, componentLayouts));
    }

    const footer = figma.createFrame();
    footer.name = 'Modal Footer';
    footer.layoutMode = 'HORIZONTAL';
    footer.itemSpacing = rowSpacing;
    footer.fills = [];
    footer.layoutAlign = 'STRETCH';
    for (const action of footerActions) {
      footer.appendChild(await createComponentNode(action, componentKeys, componentProps, componentLayouts));
    }

    structure.appendChild(modalShell);
    if (footer.children.length > 0) {
      structure.appendChild(footer);
    }
    return;
  }

  let i = 0;
  while (i < components.length) {
    const name = components[i];
    const shouldGroupRow = rowTargets.includes(name);

    if (shouldGroupRow) {
      const row = figma.createFrame();
      row.name = 'Action Row';
      row.layoutMode = 'HORIZONTAL';
      row.itemSpacing = rowSpacing;
      row.fills = [];
      row.layoutAlign = 'STRETCH';

      while (i < components.length && rowTargets.includes(components[i])) {
        const actionNode = await createComponentNode(components[i], componentKeys, componentProps, componentLayouts);
        row.appendChild(actionNode);
        i += 1;
      }

      structure.appendChild(row);
      continue;
    }

    const node = await createComponentNode(name, componentKeys, componentProps, componentLayouts);
    if (shouldStretchComponent(name, layoutStrategy)) {
      try {
        node.layoutAlign = 'STRETCH';
      } catch (e) {
        // ignore if node does not support layoutAlign
      }
    }
    if (isActionComponent(name, layoutStrategy)) {
      try {
        node.layoutGrow = 0;
      } catch (e) {
        // ignore if node does not support layoutGrow
      }
    }
    structure.appendChild(node);
    i += 1;
  }
}

async function buildSectionRow(name, components, options) {
  const { componentKeys, componentProps, componentLayouts, layoutStrategy } = options;
  const row = figma.createFrame();
  row.name = name;
  row.layoutMode = 'HORIZONTAL';
  row.itemSpacing = Number(layoutStrategy && layoutStrategy.row_item_spacing || 8);
  row.fills = [];
  row.layoutAlign = 'STRETCH';
  for (const comp of components) {
    row.appendChild(await createComponentNode(comp, componentKeys, componentProps, componentLayouts));
  }
  return row;
}

async function buildSectionColumn(name, components, options) {
  const { componentKeys, componentProps, componentLayouts, layoutStrategy } = options;
  const col = figma.createFrame();
  col.name = name;
  col.layoutMode = 'VERTICAL';
  col.itemSpacing = Number(layoutStrategy && layoutStrategy.column_item_spacing || 8);
  col.fills = [];
  col.layoutAlign = 'STRETCH';
  for (const comp of components) {
    col.appendChild(await createComponentNode(comp, componentKeys, componentProps, componentLayouts));
  }
  return col;
}

async function buildFromSections(structure, sections, options) {
  const header = sections && Array.isArray(sections.header) ? sections.header : [];
  const filterBar = sections && Array.isArray(sections.filterBar) ? sections.filterBar : [];
  const body = sections && Array.isArray(sections.body) ? sections.body : [];
  const footer = sections && Array.isArray(sections.footer) ? sections.footer : [];

  if (header.length > 0) {
    structure.appendChild(await buildSectionRow('Header', header, options));
  }
  if (filterBar.length > 0) {
    structure.appendChild(await buildSectionRow('Filter Bar', filterBar, options));
  }
  if (body.length > 0) {
    structure.appendChild(await buildSectionColumn('Body', body, options));
  }
  if (footer.length > 0) {
    structure.appendChild(await buildSectionRow('Footer', footer, options));
  }
}

async function createGeneratedFrame(payload) {
  const { title, states, components, sections, businessRules, routeMap, proposed, contextSummary, componentKeys, componentProps, componentLayouts, layoutStrategy, patternStrategy, bounds, fidelity: inputFidelity, previewDensity, reasoning, compliance } = payload;
  const fidelity = normalizeFidelity(inputFidelity);
  const profile = profileForFidelity(fidelity);
  const resolvedComponents = filterComponentsForFidelity(components, fidelity);
  const resolvedSections = filterSectionsForFidelity(sections, fidelity);

  const frame = figma.createFrame();
  frame.name = `${title || 'Generated Screen'} [${fidelity.toUpperCase()}]`;
  const width = bounds && bounds.width ? bounds.width : 960;
  const height = bounds && bounds.height ? bounds.height : 640;
  frame.resize(width, height);
  frame.x = bounds && bounds.x ? bounds.x : 120;
  frame.y = bounds && bounds.y ? bounds.y : 120;
  frame.layoutMode = 'VERTICAL';
  frame.itemSpacing = profile.frameSpacing;
  frame.paddingLeft = profile.framePadding;
  frame.paddingRight = profile.framePadding;
  frame.paddingTop = profile.framePadding;
  frame.paddingBottom = profile.framePadding;

  const titleNode = await createText(title || 'Generated Screen', 20);
  frame.appendChild(titleNode);

  const metaNode = await createText(`fidelity=${fidelity} / density=${previewDensity || 'balanced'}`, 11);
  frame.appendChild(metaNode);

  const stateRow = figma.createFrame();
  stateRow.name = 'State Variants';
  stateRow.layoutMode = 'HORIZONTAL';
  stateRow.itemSpacing = 8;
  stateRow.fills = [];

  const stateList = (states || []).slice(0, profile.maxStates);
  for (const state of stateList) {
    const chip = figma.createFrame();
    chip.layoutMode = 'HORIZONTAL';
    chip.counterAxisSizingMode = 'AUTO';
    chip.primaryAxisSizingMode = 'AUTO';
    chip.paddingLeft = 8;
    chip.paddingRight = 8;
    chip.paddingTop = 4;
    chip.paddingBottom = 4;
    chip.cornerRadius = 100;
    chip.fills = [{ type: 'SOLID', color: { r: 0.91, g: 0.95, b: 1 } }];

    const label = await createText(state, 12);
    chip.appendChild(label);
    stateRow.appendChild(chip);
  }

  if (stateRow.children.length > 0) {
    frame.appendChild(stateRow);
  }

  const structure = figma.createFrame();
  structure.name = 'Component Structure';
  structure.layoutMode = 'VERTICAL';
  structure.fills = [];
  const options = { componentKeys, componentProps, componentLayouts, layoutStrategy, patternStrategy };
  const hasSections = Boolean(
    resolvedSections &&
    ((resolvedSections.header && resolvedSections.header.length) ||
      (resolvedSections.filterBar && resolvedSections.filterBar.length) ||
      (resolvedSections.body && resolvedSections.body.length) ||
      (resolvedSections.footer && resolvedSections.footer.length))
  );
  if (hasSections) {
    await buildFromSections(structure, resolvedSections, options);
  } else {
    await buildStructuredNodes(structure, resolvedComponents || [], options);
  }
  frame.appendChild(structure);

  const noteFrame = figma.createFrame();
  noteFrame.name = 'Dev Notes';
  noteFrame.layoutMode = 'VERTICAL';
  noteFrame.itemSpacing = 4;
  noteFrame.paddingLeft = 10;
  noteFrame.paddingRight = 10;
  noteFrame.paddingTop = 10;
  noteFrame.paddingBottom = 10;
  noteFrame.cornerRadius = 8;
  noteFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 0.98, b: 0.88 } }];

  noteFrame.appendChild(await createText('[Business Rules]', 12));
  for (const rule of businessRules || []) {
    noteFrame.appendChild(await createText(`• ${rule}`, 11));
  }

  if (profile.includeReasoning) {
    noteFrame.appendChild(await createText('[Reasoning]', 12));
    for (const line of reasoning || []) {
      noteFrame.appendChild(await createText(`• ${line}`, 11));
    }
  }

  if (profile.includeCompliance) {
    noteFrame.appendChild(await createText('[Compliance]', 12));
    noteFrame.appendChild(await createText(`• blocked: ${compliance && compliance.blocked ? 'true' : 'false'}`, 11));
    noteFrame.appendChild(await createText(`• stage: ${compliance && compliance.stage ? compliance.stage : 'generation'}`, 11));
  }

  if (profile.includeRouteMap) {
    noteFrame.appendChild(await createText('[Route Map]', 12));
    for (const route of routeMap || []) {
      noteFrame.appendChild(await createText(`• ${route.action} -> ${route.to} (${route.guard})`, 11));
    }
  }

  if (Array.isArray(proposed) && proposed.length > 0) {
    noteFrame.appendChild(await createText('[Proposed Components]', 12));
    for (const row of proposed) {
      noteFrame.appendChild(await createText(`• ${row.name}: ${row.reason}`, 11));
    }
  }

  if (contextSummary && typeof contextSummary === 'object') {
    noteFrame.appendChild(await createText('[Context]', 12));
    if (contextSummary.confluence) {
      noteFrame.appendChild(await createText(`• 문서: ${contextSummary.confluence}`, 11));
    }
    if (contextSummary.editInstruction) {
      noteFrame.appendChild(await createText(`• 수정요청: ${contextSummary.editInstruction}`, 11));
    }
  }

  frame.appendChild(noteFrame);

  figma.currentPage.appendChild(frame);
  return frame;
}

function trySetPrototypeReaction(node, destinationId) {
  try {
    const reactions = [
      {
        trigger: { type: 'ON_CLICK' },
        action: {
          type: 'NODE',
          destinationId,
          navigation: 'NAVIGATE',
          transition: {
            type: 'SMART_ANIMATE',
            easing: { type: 'EASE_IN_AND_OUT' },
            duration: 0.25
          }
        }
      }
    ];
    node.reactions = reactions;
    return true;
  } catch (e) {
    return false;
  }
}

function wireFramesAsPrototype(frames) {
  if (!Array.isArray(frames) || frames.length < 2) return 0;
  let linked = 0;
  for (let i = 0; i < frames.length - 1; i += 1) {
    const current = frames[i];
    const next = frames[i + 1];
    const actionNode = current.findOne((n) => n.type === 'INSTANCE' && /button/i.test(n.name))
      || current.findOne((n) => n.type === 'FRAME' && /footer|action/i.test(n.name));
    if (actionNode && trySetPrototypeReaction(actionNode, next.id)) {
      linked += 1;
    }
  }
  return linked;
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'open-external') {
    const url = String(msg.url || '').trim();
    if (url) {
      try {
        figma.openExternal(url);
      } catch (e) {
        figma.notify('외부 브라우저 열기 실패: URL을 직접 열어주세요.');
      }
    }
  }

  if (msg.type === 'proxy-fetch') {
    const requestId = String(msg.requestId || '');
    try {
      const response = await fetch(String(msg.url || ''), {
        method: String(msg.method || 'GET'),
        headers: msg.headers || {},
        body: msg.body === undefined || msg.body === null ? undefined : String(msg.body)
      });
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = { raw: text };
        }
      }
      figma.ui.postMessage({
        type: 'proxy-fetch-result',
        requestId,
        ok: response.ok,
        status: response.status,
        data
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'proxy-fetch-result',
        requestId,
        ok: false,
        status: 0,
        error: String(error)
      });
    }
  }

  if (msg.type === 'generate-request') {
    const bounds = selectedFrameBounds();
    const selectionContext = summarizeSelectionContext();
    figma.ui.postMessage({ type: 'selected-bounds', bounds, selectionContext });
    figma.notify('DS Copilot 요청 페이로드 준비 완료');
  }

  if (msg.type === 'selection-context-request') {
    const selectionContext = summarizeSelectionContext();
    figma.ui.postMessage({ type: 'selected-context', selectionContext });
  }

  if (msg.type === 'create-generated-frame') {
    const frame = await createGeneratedFrame(msg.payload || {});
    if (frame) {
      figma.currentPage.selection = [frame];
      figma.viewport.scrollAndZoomIntoView([frame]);
    }
    figma.notify('생성 프레임 반영 완료');
  }

  if (msg.type === 'create-generated-matrix') {
    const payloads = Array.isArray(msg.payloads) ? msg.payloads : [];
    const frames = [];
    for (const payload of payloads) {
      const frame = await createGeneratedFrame(payload || {});
      if (frame) frames.push(frame);
    }
    if (frames.length > 0) {
      figma.currentPage.selection = frames;
      figma.viewport.scrollAndZoomIntoView(frames);
    }
    const linked = wireFramesAsPrototype(frames);
    figma.notify(`생성 프레임 ${frames.length}개 반영 완료 (프로토타입 링크 ${linked}개)`);
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};
