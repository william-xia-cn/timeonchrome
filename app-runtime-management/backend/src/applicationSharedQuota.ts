import { sha256Hex } from './crypto';

/** Current source key; preserve the original machine/user/assignment byte derivation. */
export const applicationSharedQuotaSourceKey=(machineId:string,localUserId:string,assignmentVersion:number)=>
  sha256Hex(`application\n${machineId}\n${localUserId}\n${assignmentVersion}`);
