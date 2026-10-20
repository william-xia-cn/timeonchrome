/* Shared display-only projection of already recorded webpage quota buckets. */
(function(root){
  'use strict';
  function empty(){return {study:0,composite:0,rest:0,other:0};}
  function category(row){
    const bucket=row?.quotaBucket||row?.mode;
    if(bucket==='study')return 'study';
    if(bucket==='composite'||bucket==='pending_composite')return 'composite';
    if(bucket==='rest')return 'rest';
    return bucket==='other'?'other':null;
  }
  function sum(rows=[]){
    const totals=empty();
    for(const row of rows){const bucket=category(row);if(bucket)totals[bucket]+=row.duration;}
    return totals;
  }
  const valid=value=>Number.isSafeInteger(value)&&value>=0;
  function application(snapshot){
    const usage=snapshot?.applicationUsage,c=usage?.nonSpecialCategories;
    if(snapshot?.durationUnit!=='seconds'||!c||Array.isArray(c)||typeof c!=='object'
      ||!Object.values(c).every(valid)||!valid(usage.nonSpecialTotal))return {values:null,complete:false};
    const values={study:c.study??0,composite:(c.composite??0)+(c.unclassified??0),rest:c.restrictedEntertainment??0,other:c.other??0};
    if(!Object.values(values).every(valid))return {values:null,complete:false};
    return {values,complete:snapshot.complete===true&&usage.complete===true
      &&Object.keys(c).every(key=>['study','composite','unclassified','restrictedEntertainment','other'].includes(key))};
  }
  function rowsResult(rows,complete=true){
    if(!Array.isArray(rows))return {values:null,complete:false};
    const accepted=rows.filter(row=>category(row)&&valid(row.duration));
    const values=sum(accepted);
    if(!Object.values(values).every(valid))return {values:null,complete:false};
    return {values:accepted.length||!rows.length?values:null,complete:complete&&accepted.length===rows.length};
  }
  function combine(web,app){
    const available=[web,app].filter(result=>result?.values);
    if(!available.length)return {values:null,complete:false};
    const values=empty();for(const result of available)for(const key of Object.keys(values))values[key]+=result.values[key];
    return Object.values(values).every(valid)?{values,complete:web?.complete===true&&app?.complete===true}:{values:null,complete:false};
  }
  const api={empty,category,sum,application,rowsResult,combine,labels:{study:'学习',composite:'复合',rest:'休息',other:'其他'}};
  if(typeof module==='object')module.exports=api;else root.WebUsageBuckets=api;
})(typeof globalThis==='object'?globalThis:this);
