import type { ApplicationKnowledge, ProductIdentityProjection } from '@timeonchrome/app-runtime-contracts/classification';
import { isSpecialApplicationProduct } from '@timeonchrome/app-runtime-contracts/classification';
import displayRules from './chrome-display-rules.json';
export const CHROME_DISPLAY_VERSION = displayRules.version;
export const CHROME_SPECIAL_PRODUCT = displayRules.productId;
export const CHROME_DISPLAY_RULES = displayRules;

/** 页面和统计只消费云端产品关联，不另查名称、签名或安装证据。 */
export function isConfirmedSpecialApplication(
  projection: ProductIdentityProjection['items'][number] | undefined, knowledge: ApplicationKnowledge | undefined): boolean {
  return Boolean(projection && ['confirmed', 'associated'].includes(projection.status)
    && isSpecialApplicationProduct(projection.productId, knowledge));
}
