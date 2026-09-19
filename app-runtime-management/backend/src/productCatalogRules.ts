import type { ApplicationKnowledge } from '@timeonchrome/app-runtime-contracts/classification';
import rawRules from './data/product-catalog-rules.v2.json';

type ProductCatalogRuleFile = {
  schemaVersion: number;
  products: Array<{
    id: string;
    name: string;
    type: ApplicationKnowledge['products'][number]['type'];
    selectors: Array<{
      field: 'distributionKey' | 'packageId' | 'productKey' | 'signerKey';
      value: string;
    }>;
  }>;
  technicalDistributionKeys: string[];
  systemToolPackageIds: string[];
};

const rules = rawRules as ProductCatalogRuleFile;

export const controlledProducts: ApplicationKnowledge['products'] = rules.products.map((product) => ({
  id: product.id,
  name: product.name,
  type: product.type,
  selectors: product.selectors.map((selector) => ({
    platform: 'windows',
    match: { operator: 'all', conditions: [{ field: selector.field, value: selector.value }] },
  })),
}));

export const technicalDistributionKeys = new Set(rules.technicalDistributionKeys.map((value) => value.toLowerCase()));
export const systemToolPackageIds = new Set(rules.systemToolPackageIds.map((value) => value.toLowerCase()));
export const productCatalogRuleVersion = rules.schemaVersion;
