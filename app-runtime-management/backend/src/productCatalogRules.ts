import type { ApplicationKnowledge } from '@timeonchrome/app-runtime-contracts/classification';
import rawRules from './data/product-catalog-rules.v1.json';

type ProductCatalogRuleFile = {
  schemaVersion: number;
  products: Array<{
    id: string;
    name: string;
    type: ApplicationKnowledge['products'][number]['type'];
    distributionKey: string;
  }>;
  technicalDistributionKeys: string[];
  operatingSystemPackageIds: string[];
};

const rules = rawRules as ProductCatalogRuleFile;

export const controlledProducts: ApplicationKnowledge['products'] = rules.products.map((product) => ({
  id: product.id,
  name: product.name,
  type: product.type,
  selectors: [{
    platform: 'windows',
    match: { operator: 'all', conditions: [{ field: 'distributionKey', value: product.distributionKey }] },
  }],
}));

export const technicalDistributionKeys = new Set(rules.technicalDistributionKeys.map((value) => value.toLowerCase()));
export const operatingSystemPackageIds = new Set(rules.operatingSystemPackageIds.map((value) => value.toLowerCase()));
export const productCatalogRuleVersion = rules.schemaVersion;
