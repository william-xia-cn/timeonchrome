const fs = require('fs');

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function newestWorkerVersion(path) {
  const deployments = readJson(path);
  const newest = [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  return newest?.versions?.find((item) => Number(item.percentage) === 100)?.version_id
    || newest?.versions?.[0]?.version_id
    || null;
}

function newestPagesDeployment(path) {
  const deployments = readJson(path);
  const sha = process.env.GITHUB_SHA || '';
  const selected = deployments.find((item) => item.Source === sha || sha.startsWith(item.Source || '')) || deployments[0];
  return selected ? { id: selected.Id, source: selected.Source, url: selected.Deployment } : null;
}

const manifest = {
  gitSha: process.env.GITHUB_SHA || null,
  contractVersion: '1.0.0',
  runtimeMigrations: (process.env.EXPECTED_RUNTIME_MIGRATIONS || '').split(',').filter(Boolean),
  runtimeWorkerVersion: newestWorkerVersion('runtime-worker-deployments.json'),
  guardianWorkerVersion: newestWorkerVersion('guardian-worker-deployments.json'),
  runtimePages: newestPagesDeployment('runtime-pages-deployments.json'),
  mainPages: newestPagesDeployment('main-pages-deployments.json'),
  r2Latest: readJson('runtime-r2-latest.json'),
  createdAt: new Date().toISOString(),
};

fs.writeFileSync('app-runtime-production-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '## App Runtime production manifest',
    '',
    `- Git SHA: \`${manifest.gitSha}\``,
    `- Contract: \`${manifest.contractVersion}\``,
    `- Runtime migrations: \`${manifest.runtimeMigrations.join(', ') || 'none'}\``,
    `- Runtime Worker: \`${manifest.runtimeWorkerVersion}\``,
    `- Guardian Worker: \`${manifest.guardianWorkerVersion}\``,
    `- Runtime Pages: \`${manifest.runtimePages?.id || 'unknown'}\``,
    `- Main Pages: \`${manifest.mainPages?.id || 'unknown'}\``,
    `- R2 latest: \`${manifest.r2Latest?.version || 'unknown'}\``,
    '',
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}
