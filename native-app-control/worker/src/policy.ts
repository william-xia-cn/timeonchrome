import type { SantaRule } from './types';

export type IdentityForPolicy = {
  identityType: 'SIGNINGID' | 'CDHASH' | 'BINARY';
  identifier: string;
};

export type ApplicationPresentationClass =
  | 'USER_APPLICATION'
  | 'APPLICATION_COMPONENT'
  | 'SYSTEM_COMPONENT'
  | 'STANDALONE_BACKGROUND'
  | 'UNKNOWN_EXECUTABLE';

export type ApplicationPresentationRow = {
  id: string;
  display_name?: string | null;
  publisher?: string | null;
  team_id?: string | null;
  top_level_bundle_id?: string | null;
  bundle_id?: string | null;
  bundle_path?: string | null;
  sample_path?: string | null;
  last_observed_at?: number | null;
  [key: string]: unknown;
};

export type PresentedApplication = ApplicationPresentationRow & {
  presentationClass: ApplicationPresentationClass;
  reviewPriority: 'PRIMARY' | 'BACKGROUND' | 'SYSTEM';
  relatedApplicationIds: string[];
  components: Array<ApplicationPresentationRow & {
    presentationClass: 'APPLICATION_COMPONENT';
    reviewPriority: 'ATTACHED';
  }>;
  componentCount: number;
};

function normalizedPath(value: unknown): string {
  return String(value || '').trim().replace(/\\/g, '/');
}

export function outerApplicationPath(input: ApplicationPresentationRow): string | null {
  for (const raw of [input.bundle_path, input.sample_path]) {
    const path = normalizedPath(raw);
    const match = path.match(/^(.+?\.app)(?:\/|$)/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

export function classifyApplicationPresentation(
  input: ApplicationPresentationRow
): ApplicationPresentationClass {
  const path = normalizedPath(input.sample_path || input.bundle_path);
  const outerApp = outerApplicationPath(input);
  const componentPath = /\.app\/Contents\/(?:Frameworks|Helpers|XPCServices|Library\/LoginItems|Library\/LaunchServices)\//i;
  const systemPath = /^(?:\/System(?:\/|$)|\/usr\/(?:bin|sbin|libexec)(?:\/|$)|\/(?:bin|sbin)(?:\/|$)|\/Library\/Apple\/System(?:\/|$))/i;
  const userFacingSystemApp = /^\/System\/Applications\/[^/]+\.app\/Contents\/MacOS(?:\/|$)/i;
  const backgroundPath = /(?:\/Library\/(?:LaunchDaemons|PrivilegedHelperTools)(?:\/|$)|\.app\/Contents\/Library\/LaunchServices(?:\/|$))/i;

  if (outerApp && componentPath.test(path)) return 'APPLICATION_COMPONENT';
  if (userFacingSystemApp.test(path)) return 'USER_APPLICATION';
  if (systemPath.test(path)) return 'SYSTEM_COMPONENT';
  if (backgroundPath.test(path)) return 'STANDALONE_BACKGROUND';
  if (outerApp || input.top_level_bundle_id || input.bundle_id) return 'USER_APPLICATION';
  return 'UNKNOWN_EXECUTABLE';
}

function parentCandidateKey(input: ApplicationPresentationRow): string | null {
  const outerPath = outerApplicationPath(input);
  if (outerPath) return `path:${outerPath}`;
  const team = String(input.team_id || '').trim().toUpperCase();
  const bundle = String(input.top_level_bundle_id || input.bundle_id || '').trim().toLowerCase();
  return team && bundle ? `bundle:${team}:${bundle}` : null;
}

function presentationIdentityKey(input: ApplicationPresentationRow): string | null {
  const team = String(input.team_id || '').trim().toUpperCase();
  const bundle = String(input.top_level_bundle_id || input.bundle_id || '').trim().toLowerCase();
  if (bundle) return `bundle:${team || 'unsigned'}:${bundle}`;
  return parentCandidateKey(input);
}

function validPublisherText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && !text.includes('[object Object]') ? text : null;
}

function objectText(input: unknown, keys: string[]): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  for (const key of keys) {
    const value = validPublisherText(row[key]);
    if (value) return value;
  }
  return null;
}

export function normalizePublisher(input: Record<string, unknown>): string | null {
  const direct = validPublisherText(input.publisher);
  if (direct) return direct;
  const chain = Array.isArray(input.signing_chain)
    ? input.signing_chain
    : input.signing_chain ? [input.signing_chain] : [];
  for (const item of chain) {
    const name = objectText(item, ['common_name', 'commonName', 'cn', 'organization', 'org', 'name']);
    if (name) return name;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const subject = (item as Record<string, unknown>).subject;
      const subjectName = objectText(subject, ['common_name', 'commonName', 'cn', 'organization', 'org', 'name']);
      if (subjectName) return subjectName;
    }
  }
  return null;
}

export function normalizeStoredPublisher(value: unknown): string | null {
  return validPublisherText(value);
}

export function buildApplicationPresentation(
  rows: ApplicationPresentationRow[]
): PresentedApplication[] {
  const classified = rows.map((row) => ({
    ...row,
    presentationClass: classifyApplicationPresentation(row),
  }));
  const parentByKey = new Map<string, PresentedApplication>();
  const applicationByIdentity = new Map<string, PresentedApplication>();
  const output: PresentedApplication[] = [];

  for (const row of classified) {
    if (row.presentationClass !== 'USER_APPLICATION') continue;
    const identityKey = presentationIdentityKey(row);
    const existing = identityKey ? applicationByIdentity.get(identityKey) : null;
    if (existing) {
      existing.relatedApplicationIds.push(row.id);
      if (Number(row.last_observed_at || 0) > Number(existing.last_observed_at || 0)) {
        existing.last_observed_at = row.last_observed_at;
        existing.sample_path = row.sample_path || existing.sample_path;
      }
      continue;
    }
    const presented = {
      ...row,
      reviewPriority: 'PRIMARY' as const,
      relatedApplicationIds: [row.id],
      components: [],
      componentCount: 0,
    } as PresentedApplication;
    output.push(presented);
    if (identityKey) applicationByIdentity.set(identityKey, presented);
    const key = parentCandidateKey(row);
    if (key && !parentByKey.has(key)) parentByKey.set(key, presented);
  }

  for (const row of classified) {
    if (row.presentationClass === 'USER_APPLICATION') continue;
    if (row.presentationClass === 'APPLICATION_COMPONENT') {
      const key = parentCandidateKey(row);
      const parent = key ? parentByKey.get(key) : null;
      if (parent) {
        parent.components.push({
          ...row,
          presentationClass: 'APPLICATION_COMPONENT',
          reviewPriority: 'ATTACHED',
        });
        parent.componentCount = parent.components.length;
        continue;
      }
    }
    const reviewPriority = row.presentationClass === 'SYSTEM_COMPONENT'
      ? 'SYSTEM'
      : row.presentationClass === 'UNKNOWN_EXECUTABLE'
        ? 'PRIMARY'
        : 'BACKGROUND';
    output.push({
      ...row,
      reviewPriority,
      relatedApplicationIds: [row.id],
      components: [],
      componentCount: 0,
    } as PresentedApplication);
  }

  const priority = { PRIMARY: 0, BACKGROUND: 1, SYSTEM: 2 };
  return output.sort((left, right) => {
    const priorityDelta = priority[left.reviewPriority] - priority[right.reviewPriority];
    if (priorityDelta) return priorityDelta;
    return Number(right.last_observed_at || 0) - Number(left.last_observed_at || 0);
  });
}

export function canonicalSigningIdentifier(teamId: string, signingId: string): string {
  const team = String(teamId || '').trim();
  const signing = String(signingId || '').trim();
  if (!team || !signing) return signing;
  const prefix = `${team}:`;
  return signing.toUpperCase().startsWith(prefix.toUpperCase()) ? signing : `${prefix}${signing}`;
}

export function canonicalStoredSigningIdentifier(identifier: string): string {
  const parts = String(identifier || '').trim().split(':');
  if (parts.length >= 3 && parts[0].toUpperCase() === parts[1].toUpperCase()) {
    return [parts[0], ...parts.slice(2)].join(':');
  }
  return parts.join(':');
}

export function chooseIdentity(input: Record<string, unknown>): IdentityForPolicy | null {
  const teamId = String(input.team_id || input.teamID || '').trim();
  const signingId = String(input.signing_id || input.signingID || '').trim();
  const cdhash = String(input.cdhash || '').trim();
  const sha256 = String(input.file_sha256 || input.sha256 || '').trim().toLowerCase();
  if (teamId && signingId) {
    return { identityType: 'SIGNINGID', identifier: canonicalSigningIdentifier(teamId, signingId) };
  }
  if (cdhash) return { identityType: 'CDHASH', identifier: cdhash };
  if (/^[a-f0-9]{64}$/.test(sha256)) return { identityType: 'BINARY', identifier: sha256 };
  return null;
}

export function applicationGroupKey(input: Record<string, unknown>): string {
  const teamId = String(input.team_id || input.teamID || 'unsigned').trim().toUpperCase();
  const topLevelBundleId = String(input.top_level_bundle_id || input.parent_bundle_id || '').trim().toLowerCase();
  if (topLevelBundleId) return `${teamId}:${topLevelBundleId}`;
  const bundleId = String(
    input.bundle_id || input.bundleID || input.bundle_identifier || input.file_bundle_id || ''
  ).trim().toLowerCase();
  const eventPath = String(input.file_path || input.path || '').replace(/\\/g, '/');
  const componentPath = /\.app\/Contents\/(?:Frameworks|Helpers|XPCServices|Library\/LoginItems|Library\/LaunchServices)\//i;
  if (bundleId && !componentPath.test(eventPath)) return `${teamId}:${bundleId}`;
  const outerAppPath = outerApplicationPath({
    id: 'event',
    bundle_path: String(input.bundle_path || ''),
    sample_path: eventPath,
  });
  if (outerAppPath) {
    const outerAppName = outerAppPath.split('/').pop();
    if (outerAppName) return `${teamId}:app:${outerAppName}`;
  }
  if (bundleId) return `${teamId}:${bundleId}`;
  const signingId = String(input.signing_id || input.signingID || '').trim().toLowerCase();
  if (signingId) return `${teamId}:signing:${signingId}`;
  const identity = chooseIdentity(input);
  return `${teamId}:identity:${identity?.identifier || 'unknown'}`;
}

export function normalizeSantaEvent(input: Record<string, unknown>) {
  const identity = chooseIdentity(input);
  if (!identity) return null;
  const path = String(input.file_path || input.path || '').trim();
  const name = String(input.file_name || input.name || path.split('/').pop() || 'Unknown application').trim();
  const bundleId = String(input.bundle_id || input.bundleID || input.bundle_identifier || input.file_bundle_id || '').trim() || null;
  const topLevelBundleId = String(input.top_level_bundle_id || input.parent_bundle_id || bundleId || '').trim() || null;
  const rawBundleHash = String(input.file_bundle_hash || '').trim().toLowerCase();
  const bundleHash = /^[a-f0-9]{64}$/.test(rawBundleHash) ? rawBundleHash : null;
  return {
    identityType: identity.identityType,
    identifier: identity.identifier,
    identityKey: `${identity.identityType}:${identity.identifier}`,
    teamId: String(input.team_id || input.teamID || '').trim() || null,
    signingId: String(input.signing_id || input.signingID || '').trim() || null,
    cdhash: String(input.cdhash || '').trim() || null,
    sha256: String(input.file_sha256 || input.sha256 || '').trim().toLowerCase() || null,
    bundleId,
    topLevelBundleId,
    bundlePath: String(input.bundle_path || '').trim() || null,
    groupKey: applicationGroupKey(input),
    name,
    publisher: normalizePublisher(input),
    samplePath: path || null,
    executingUser: String(input.executing_user || input.logged_in_users || '').split(',')[0].trim() || null,
    decision: String(input.decision || '').trim() || null,
    bundleHash,
  };
}

export function compileSantaRules(
  blockedApplications: Array<{ identities: IdentityForPolicy[] }>,
  blockedPublishers: string[],
  baselineRule: SantaRule
): SantaRule[] {
  const rules: SantaRule[] = [baselineRule];
  for (const application of blockedApplications) {
    const sorted = [...application.identities].sort((left, right) => {
      const order = { SIGNINGID: 0, CDHASH: 1, BINARY: 2 };
      return order[left.identityType] - order[right.identityType];
    });
    for (const identity of sorted) {
      rules.push({
        identifier: identity.identityType === 'SIGNINGID'
          ? canonicalStoredSigningIdentifier(identity.identifier)
          : identity.identifier,
        policy: 'BLOCKLIST',
        rule_type: identity.identityType,
      });
    }
  }
  for (const teamId of blockedPublishers) {
    if (teamId) rules.push({ identifier: teamId, policy: 'BLOCKLIST', rule_type: 'TEAMID' });
  }
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.rule_type}:${rule.identifier}:${rule.policy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseBaselineRule(raw: string): SantaRule {
  const parsed = JSON.parse(raw || '{}');
  if (
    parsed.identifier !== '0'.repeat(64)
    || parsed.rule_type !== 'BINARY'
    || parsed.policy !== 'ALLOWLIST'
  ) {
    throw new Error('SANTA_BASELINE_RULE_JSON is not a validated Santa rule');
  }
  return parsed as SantaRule;
}
