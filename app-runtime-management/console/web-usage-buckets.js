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
  const api={empty,category,sum,labels:{study:'学习',composite:'复合',rest:'休息',other:'其他'}};
  if(typeof module==='object')module.exports=api;else root.WebUsageBuckets=api;
})(typeof globalThis==='object'?globalThis:this);
