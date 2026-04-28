import defaults from '../../config/site-access-defaults.json';

export const siteAccessDefaults = defaults;

export function mergeWithDefaults(
  customList: string[],
  defaultList: string[]
): string[] {
  const defaultSet = new Set(defaultList.map(d => d.toLowerCase()));
  const custom = customList.filter(d => !defaultSet.has(d.toLowerCase()));
  return [...defaultList, ...custom];
}
