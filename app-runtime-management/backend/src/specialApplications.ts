import type { AppEvidence, ApplicationKnowledge, ProductIdentityProjection } from '@timeonchrome/app-runtime-contracts/classification';
import { matches } from '@timeonchrome/app-runtime-contracts/classification';
import displayRules from './chrome-display-rules.json';
export const CHROME_DISPLAY_VERSION = displayRules.version;
export const CHROME_SPECIAL_PRODUCT = displayRules.productId;
export const CHROME_DISPLAY_RULES = displayRules;

/** Presentation only. Never changes AppPolicy, classification or quotaBucket. */
export function isConfirmedChrome(evidence: AppEvidence | undefined,
  projection?: ProductIdentityProjection['items'][number], knowledge?: ApplicationKnowledge): boolean {
  if (projection?.status === 'conflict') return false;
  if(evidence&&projection&&(evidence.platform!==projection.platform||evidence.runtimeIdentity!==projection.runtimeIdentity))return false;
  // macOS uploads an opaque team+bundle package identity, not a bare bundle ID.
  // Until audited, only the approved strong-selector association below applies.
  if (evidence?.platform === 'windows' && evidence.verifiedFields.includes('fileSeriesKey')
      && evidence.verifiedFields.includes('signerKey')
      && evidence.values.fileSeriesKey === displayRules.windows.fileSeriesKey
      && evidence.values.signerKey === displayRules.windows.signerKey) return true;
  // The controlled product declaration AND an approved leaf association AND
  // an actual match against verified strong evidence are all required.
  if(!evidence||projection?.status!=='confirmed'||projection.reasonCode!=='APPROVED_PRODUCT'
    ||projection.productId!=='builtin.browser.chrome')return false;
  const product=knowledge?.products.find(item=>item.id==='builtin.browser.chrome');
  const strong=new Set(['binaryHash','packageId','fileSeriesKey']);
  return Boolean(product?.selectors.some(selector=>selector.platform===evidence.platform
    &&matches(selector.match,evidence,true)
    &&(selector.match.operator==='all'?selector.match.conditions.some(condition=>strong.has(condition.field)
      &&evidence.verifiedFields.includes(condition.field)&&evidence.values[condition.field]===condition.value)
      :selector.match.conditions.every(condition=>strong.has(condition.field)&&evidence.verifiedFields.includes(condition.field)))));
}
