/* 配置域边界；不执行网络写入，不决定网站访问或计时语义。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AccessConfigDomains = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const publicMinutes = ['studyMinutes', 'compositeMinutes', 'restMinutes'];
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const reminders = ['firstReminderMinutes', 'repeatReminderMinutes', 'weeklyFirstReminderMinutes'];
  const autonomy = ['restrictedEntryConfirmationRequired', 'softReminderTimeoutAction'];
  const windows = ['studyWindows', 'compositeWindows', 'restWindows'];
  const websiteFields = ['customStudyList', 'customCompositeList', 'customRestrictedEntertainmentList', 'customBlockedSites', 'siteClassificationRulesV1', 'siteUsageClassificationRulesV1', 'domainQuotas'];
  const publicAreas = new Set(['weekly-quota', 'rest-reminder', 'autonomy', 'time-window']);
  const websiteAreas = new Set(['site-list', 'rule', 'usage-rule', 'domain-quota', 'unclassified-notification']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (value, key) => value && Object.prototype.hasOwnProperty.call(value, key);
  const pick = (value, keys) => Object.fromEntries(keys.filter(key => own(value, key)).map(key => [key, clone(value[key])]));
  function checkDomain(domain) {
    if (!['publicAccess', 'websites'].includes(domain)) throw new Error('应用配置须由 App Policy 管理；请选择综合访问或网站配置');
  }
  function days(value, keys) {
    const result = {};
    for (const day of dayNames) {
      if (own(value, day)) result[day] = pick(value[day], keys);
    }
    return result;
  }
  function projectProfile(domain, source) {
    checkDomain(domain);
    if (!source || source.app !== 'TimeOnChrome' || source.configType !== 'profile-config' || source.configVersion !== 1) throw new Error('不支持的孩子配置格式');
    const result = { app: 'TimeOnChrome', configType: 'profile-config', configVersion: 1 };
    if (domain === 'publicAccess') {
      result.quota = {
        timeQuota: { ...pick(source.quota?.timeQuota, ['accountingVersion']), daily: days(source.quota?.timeQuota?.daily, publicMinutes), weekly: pick(source.quota?.timeQuota?.weekly, ['restMinutes']) },
        restConfig: pick(source.quota?.restConfig, ['firstReminderMinutes', 'repeatReminderMinutes', 'weeklyFirstReminderMinutes']),
        autonomyConfig: pick(source.quota?.autonomyConfig, ['restrictedEntryConfirmationRequired', 'softReminderTimeoutAction']),
      };
      result.timeWindows = { daily: days(source.timeWindows?.daily, windows) };
    } else {
      result.siteAccess = {
        customLists: pick(source.siteAccess?.customLists, ['studySites', 'compositeSites', 'restrictedEntertainmentSites', 'blockedSites']),
        // 只保存公开匹配条件，不复制 rawRule、审核人、请求身份或诊断信息。
        classificationRules: (source.siteAccess?.classificationRules || []).map(rule => pick(rule, ['decision', 'targetType', 'normalizedValue'])),
        usageClassificationRules: (source.siteAccess?.usageClassificationRules || []).map(rule => pick(rule, ['classification', 'targetType', 'normalizedValue'])),
      };
      result.quota = { domainQuotas: clone(source.quota?.domainQuotas || {}), timeQuota: { daily: days(source.quota?.timeQuota?.daily, ['onlineMinutes']) } };
      if (source.notifications?.unclassifiedUsage) result.notifications = { unclassifiedUsage: pick(source.notifications.unclassifiedUsage, ['enabled', 'thresholdMinutes']) };
    }
    return result;
  }
  function createFile(domain, profile, systemConfig) {
    checkDomain(domain);
    if (systemConfig && domain !== 'websites') throw new Error('全局网站库不能进入公共访问配置');
    const file = { app: 'TimeOnChrome', configType: 'access-domain-config', schemaVersion: 2, domain, profileConfig: projectProfile(domain, profile) };
    if (systemConfig) file.systemConfig = clone(systemConfig);
    return file;
  }
  function readFile(domain, file) {
    checkDomain(domain);
    if (!file || file.app !== 'TimeOnChrome') throw new Error('不是 TimeOnChrome 配置文件');
    let profile, systemConfig;
    if (file.configType === 'access-domain-config') {
      if (file.schemaVersion !== 2 || file.domain !== domain) throw new Error('文件配置域或版本与当前选择不一致');
      if (domain !== 'websites' && own(file, 'systemConfig')) throw new Error('公共访问文件不允许全局网站库');
      profile = file.profileConfig; systemConfig = file.systemConfig;
    } else if (file.configType === 'profile-config') profile = file;
    else if (file.configType === 'access-management-config-bundle' && file.schemaVersion === 1) {
      profile = file.scopes?.userConfig ? file.userConfig : undefined;
      systemConfig = domain === 'websites' && file.scopes?.systemConfig ? file.systemConfig : undefined;
    } else if (file.configType === 'system-access-config' && file.schemaVersion === 1 && domain === 'websites') systemConfig = file;
    else throw new Error('不支持的配置文件');
    if (!profile && !systemConfig) throw new Error('所选域没有可导入的配置');
    return { domain, profileConfig: profile ? projectProfile(domain, profile) : null, systemConfig: systemConfig ? clone(systemConfig) : null };
  }
  function permitsDiff(domain, diff) {
    checkDomain(domain);
    if (diff.area === 'quota') return domain === 'websites' ? diff.field === 'onlineMinutes' : publicMinutes.includes(diff.field);
    if (diff.area === 'time-window') return domain === 'publicAccess' && windows.includes(diff.field);
    if (diff.area === 'rest-reminder') return domain === 'publicAccess' && reminders.includes(diff.key);
    if (diff.area === 'autonomy') return domain === 'publicAccess' && autonomy.includes(diff.key);
    if (diff.area === 'weekly-quota') return domain === 'publicAccess' && diff.key === 'restMinutes';
    return (domain === 'publicAccess' ? publicAreas : websiteAreas).has(diff.area);
  }
  function filterDiffs(domain, diffs) { return diffs.filter(diff => permitsDiff(domain, diff)); }
  function assertContext(preview, current) {
    if (!preview || !current || !preview.childId || !Number.isInteger(preview.version) || preview.version < 0 || !preview.instance) throw new Error('导入上下文尚未就绪');
    checkDomain(preview.domain);
    for (const key of ['childId', 'version', 'domain', 'instance']) if (preview[key] !== current[key]) throw new Error('孩子、配置或页面已变化，请重新预览');
  }
  function buildPatch(domain, candidate, current, selectedDiffs) {
    checkDomain(domain);
    if (selectedDiffs.some(diff => !permitsDiff(domain, diff))) throw new Error('导入包含跨域差异');
    const result = {};
    const selectedAreas = new Set(selectedDiffs.map(diff => diff.area));
    if (domain === 'websites') {
      const fieldAreas = ['site-list', 'site-list', 'site-list', 'site-list', 'rule', 'usage-rule', 'domain-quota'];
      websiteFields.forEach((field, index) => { if (selectedAreas.has(fieldAreas[index])) result[field] = clone(candidate[field]); });
    } else {
      if (selectedAreas.has('rest-reminder')) result.restConfig = pick(candidate.restConfig, selectedDiffs.filter(diff => diff.area === 'rest-reminder').map(diff => diff.key));
      if (selectedAreas.has('autonomy')) result.autonomyConfig = pick(candidate.autonomyConfig, selectedDiffs.filter(diff => diff.area === 'autonomy').map(diff => diff.key));
      if (selectedAreas.has('time-window')) {
        result.timeWindows = clone(current.timeWindows || { daily: {} });
        result.timeWindows.daily = result.timeWindows.daily || {};
        for (const diff of selectedDiffs.filter(diff => diff.area === 'time-window')) {
          if (!dayNames.includes(diff.day)) throw new Error('无效日期');
          const row = result.timeWindows.daily[diff.day] || {};
          if (own(candidate.timeWindows?.daily?.[diff.day], diff.field)) row[diff.field] = clone(candidate.timeWindows.daily[diff.day][diff.field]);
          else delete row[diff.field];
          result.timeWindows.daily[diff.day] = row;
        }
      }
      if (selectedAreas.has('weekly-quota')) result.timeQuota = { weekly: pick(candidate.timeQuota?.weekly, ['restMinutes']) };
    }
    const quotaDiffs = selectedDiffs.filter(diff => diff.area === 'quota');
    if (quotaDiffs.length) {
      result.timeQuota = result.timeQuota || {};
      result.timeQuota.daily = {};
      for (const diff of quotaDiffs) {
        if (!dayNames.includes(diff.day)) throw new Error('无效日期');
        const row = result.timeQuota.daily[diff.day] || clone(current.timeQuota?.daily?.[diff.day] || {});
        if (own(candidate.timeQuota?.daily?.[diff.day], diff.field)) row[diff.field] = clone(candidate.timeQuota.daily[diff.day][diff.field]);
        else delete row[diff.field];
        result.timeQuota.daily[diff.day] = row;
      }
    }
    return result;
  }
  return Object.freeze({ projectProfile, createFile, readFile, filterDiffs, assertContext, buildPatch });
});
