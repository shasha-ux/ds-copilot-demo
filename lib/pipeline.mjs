import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildFigmaEvents, buildPlan, validatePlan } from './generator.mjs';
import { planToIR } from './ir.mjs';
import { buildCodeBundle } from './export-bundle.mjs';
import { saveBundle } from './bundle-store.mjs';
import { evaluateCompliance } from './compliance.mjs';

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function buildManifest(input, plan, ir, bundleMeta) {
  return {
    version: '0.1.0',
    generatedAt: new Date().toISOString(),
    input: {
      prompt: input.prompt,
      hasDataSchema: Boolean(input.dataSchema),
      fidelity: input.fidelity || plan.fidelity || 'prototype'
    },
    summary: {
      title: plan.title,
      fidelity: plan.fidelity || 'prototype',
      states: plan.states,
      components: plan.components,
      sectionKeys: Object.keys(plan.sections || {})
    },
    bundle: {
      outputName: bundleMeta.outputName,
      files: bundleMeta.files,
      fileHashes: Object.fromEntries(
        Object.entries(bundleMeta.fileContents || {}).map(([name, content]) => [name, sha256(String(content))])
      )
    },
    irDigest: sha256(JSON.stringify(ir))
  };
}

export function runPipeline({ prompt, dataSchema, outputName, fidelity = 'prototype', registry, outputRoot }) {
  const plan = buildPlan(prompt || '', dataSchema || '', registry, { fidelity });
  const validation = validatePlan(plan, registry);
  const compliance = evaluateCompliance({
    validation,
    stage: 'deploy',
    policy: registry.compliance_policy || {},
    allowNew: true
  });

  if (compliance.blocked) {
    return {
      ok: false,
      error: 'Deployment compliance check failed',
      blocked: compliance.blockedItems,
      compliance,
      plan,
      validation
    };
  }

  const ir = planToIR(plan);
  const bundle = buildCodeBundle(ir);
  const saved = saveBundle(outputRoot, outputName, bundle);
  const figmaEvents = buildFigmaEvents(plan, registry);

  const manifest = buildManifest(
    { prompt, dataSchema, fidelity },
    plan,
    ir,
    {
      outputName: saved.outputName,
      files: saved.files,
      fileContents: bundle.files
    }
  );

  const manifestPath = path.join(saved.outputDir, 'manifest.json');
  const enrichedManifest = {
    ...manifest,
    validation,
    compliance,
    figmaEvents
  };
  fs.writeFileSync(manifestPath, JSON.stringify(enrichedManifest, null, 2));

  return {
    ok: true,
    plan,
    validation,
    compliance,
    ir,
    bundle,
    saved: {
      ...saved,
      manifestPath
    },
    manifest: enrichedManifest,
    figmaEvents
  };
}
