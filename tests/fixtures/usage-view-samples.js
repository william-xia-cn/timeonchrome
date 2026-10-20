'use strict';
const date='2026-10-21',start=Date.parse(date+'T00:00:00+08:00');
const application={
  model:'program-instance-v1',source:'application',childId:'fixture-child',durationUnit:'seconds',
  fromDate:date,toDate:date,complete:true,totalDuration:5400,availableTotalDuration:5400,
  applicationUsage:{nonSpecialTotal:3600,nonSpecialCategories:{study:1200,composite:600,unclassified:300,restrictedEntertainment:900,other:600},specialTotal:1800,complete:true,reasonCodes:[]},
  categories:[{classification:'study',duration:1200},{classification:'unclassified',duration:300},{classification:'other',duration:600}],
  applications:[{subjectKey:'fixture:machine-b:editor',displayName:'编辑器',duration:1200,classifications:['study']},
    {subjectKey:'fixture:machine-a:editor',displayName:'编辑器',duration:1200,classifications:['study']},
    {subjectKey:'fixture:browser',displayName:'浏览器（特殊应用）',duration:1800,classifications:['composite']},
    {subjectKey:'fixture:long',displayName:'这是一个用于核对窄屏换行与搜索的较长应用名称',duration:600,classifications:['other']}],
  buckets:Array.from({length:24},(_,hour)=>({startAtMs:start+hour*3600000,duration:hour===9?1800:hour===10?2400:hour===11?1200:0})),
  instances:[],days:[{date,complete:true,totalDuration:5400,settledThroughMs:start+43200000}],
  statistics:{producer:'native',settledThroughByDate:[{date,settledThroughMs:start+43200000}]},
  productStatus:{complete:true,reasonCodes:[]},revision:'fixture-app-1'
};
const computer={
  schemaVersion:2,durationUnit:'seconds',revision:'fixture-computer-1',fromDate:date,toDate:date,complete:true,
  sourceStatus:{web:'complete',application:'complete'},sourceVersions:{web:'fixture-web-1',application:'fixture-app-1'},
  totals:{computer:4200,web:600,application:5400,specialIncluded:1800},
  categories:{study:1500,composite:900,unclassified:300,restrictedEntertainment:900,other:600},
  sourceCategories:{web:{study:300,composite:300},application:{study:1200,composite:2400,unclassified:300,restrictedEntertainment:900,other:600}},
  reasonCodes:[]
};
module.exports={application,computer};
