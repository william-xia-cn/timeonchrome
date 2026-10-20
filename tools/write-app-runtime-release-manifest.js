const fs = require('fs');
const evidenceErrors = [];

function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch { evidenceErrors.push(`Unavailable evidence: ${path}`); return null; }
}

function newestWorkerVersion(path) {
  const deployments = readJson(path) || [];
  const newest = [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  return newest?.versions?.find((item) => Number(item.percentage) === 100)?.version_id
    || newest?.versions?.[0]?.version_id
    || null;
}

function newestPagesDeployment(path) {
  const deployments = readJson(path) || [];
  const sha = process.env.GITHUB_SHA || '';
  const selected = deployments.find((item) => item.Source && sha && sha.startsWith(item.Source)) || deployments[0];
  return selected ? { id: selected.Id, source: selected.Source, url: selected.Deployment } : null;
}

const steps = JSON.parse(process.env.RELEASE_STEPS || '{}');
const resources = [
  ['DEPLOY_RUNTIME_WORKER', 'runtimeWorker', 'runtime_deploy'],
  ['DEPLOY_RUNTIME_PAGES', 'runtimePages', 'runtime_pages_deploy'],
  ['DEPLOY_GUARDIAN_WORKER', 'guardianWorker', 'guardian_deploy'],
  ['DEPLOY_MAIN_PAGES', 'mainPages', 'main_pages_deploy'],
];
const manifest = {
  jobStatus: process.env.RELEASE_JOB_STATUS || 'unknown',
  stepOutcomes: Object.fromEntries(Object.entries(JSON.parse(process.env.RELEASE_STEPS || '{}'))
    .map(([name, step]) => [name, step.outcome || 'unknown'])),
  gitSha: process.env.GITHUB_SHA || null,
  contractVersion: readJson('app-runtime-management/contracts/package.json')?.version || null,
  runtimeMigrations: (process.env.APPLIED_RUNTIME_MIGRATIONS || '').split(',').filter(Boolean),
  guardianMigrations: (process.env.APPLIED_GUARDIAN_MIGRATIONS || '').split(',').filter(Boolean),
  sharedAccessShadowPrepared: process.env.PREPARE_SHARED_ACCESS_SHADOW === 'true',
  requestedResources: resources.filter(([flag]) => process.env[flag] === 'true').map(([, resource]) => resource),
  deployedResources: resources.filter(([, , step]) => steps[step]?.outcome === 'success').map(([, resource]) => resource),
  runtimeWorkerVersion: newestWorkerVersion('runtime-worker-deployments.json'),
  guardianWorkerVersion: newestWorkerVersion('guardian-worker-deployments.json'),
  runtimePages: newestPagesDeployment('runtime-pages-deployments.json'),
  mainPages: newestPagesDeployment('main-pages-deployments.json'),
  r2Latest: readJson('runtime-r2-latest.json'),
  createdAt: new Date().toISOString(),
  evidenceErrors,
  deploymentListingNote: '版本清单为采样时的观察结果；是否本次部署成功仅依据stepOutcomes，不以最新版本代替步骤结果。',
};

fs.writeFileSync('app-runtime-production-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '## App Runtime production manifest',
    '',
    `- Job status before manifest: \`${manifest.jobStatus}\``,
    `- Step outcomes: \`${JSON.stringify(manifest.stepOutcomes)}\``,
    `- Git SHA: \`${manifest.gitSha}\``,
    `- Contract: \`${manifest.contractVersion}\``,
    `- Deployed resources: \`${manifest.deployedResources.join(', ') || 'none'}\``,
    `- Runtime migrations: \`${manifest.runtimeMigrations.join(', ') || 'none'}\``,
    `- Guardian migrations: \`${manifest.guardianMigrations.join(', ') || 'none'}\``,
    `- Shared access shadow prepared (not execution enabled): \`${manifest.sharedAccessShadowPrepared}\``,
    `- Runtime Worker: \`${manifest.runtimeWorkerVersion}\``,
    `- Guardian Worker: \`${manifest.guardianWorkerVersion}\``,
    `- Runtime Pages: \`${manifest.runtimePages?.id || 'unknown'}\``,
    `- Main Pages: \`${manifest.mainPages?.id || 'unknown'}\``,
    `- R2 latest: \`${manifest.r2Latest?.version || 'unknown'}\``,
    '',
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}
