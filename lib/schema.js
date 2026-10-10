// Report schema v3: additive migration + validation (v1..v3).
export const REPORT_VERSION=3;
const clone=o=>typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o));

export function migrate(report){
  const r=report&&typeof report==='object'&&!Array.isArray(report)?clone(report):{};
  if(!Array.isArray(r.advancedTests))r.advancedTests=[];
  if(!Array.isArray(r.logFiles))r.logFiles=[];
  for(const k of ['windowsLogs','checklist','identity'])if(r[k]===undefined)r[k]=null;
  r.version=REPORT_VERSION;
  return r;
}

const isObj=v=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export function validateReportV3(obj){
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return 'Report is not a JSON object.';
  if(typeof obj.version!=='number'||obj.version<1||obj.version>REPORT_VERSION)return 'Unsupported report version: '+(obj.version??'missing')+'.';
  if(typeof obj.eventCount!=='number')return 'Report is missing eventCount.';
  if(obj.keys!==undefined&&!Array.isArray(obj.keys))return 'Report keys must be an array.';
  if(obj.controls!==undefined&&(typeof obj.controls!=='object'||obj.controls===null))return 'Report controls must be an object.';
  for(const k of ['advancedTests','logFiles'])if(obj[k]!==undefined&&!Array.isArray(obj[k]))return 'Report '+k+' must be an array.';
  for(const k of ['windowsLogs','checklist','identity'])if(obj[k]!==undefined&&obj[k]!==null&&!isObj(obj[k]))return 'Report '+k+' must be an object or null.';
  return null;
}
