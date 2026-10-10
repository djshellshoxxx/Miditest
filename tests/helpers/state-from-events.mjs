// Builds the buildTestResults() input from raw captured events, mirroring what app-v2.js accumulates.
import {decodeMessage} from '../../midi-core.js';
export function inputFromEvents(evs){
  const events=[],velocityByKey=new Map(),velocityValues=[],cc=new Map(),ccTimes=new Map(),sustainValues=[],sustainTimes=[],pitchValues=[],pitchTimes=[];
  for(const x of evs){const e={...decodeMessage(x.raw),t:x.t};events.push(e);
    if(e.kind==='noteon'){velocityValues.push(e.b);if(!velocityByKey.has(e.a))velocityByKey.set(e.a,[]);velocityByKey.get(e.a).push(e.b)}
    if(e.kind==='cc'){const k=e.channel+':'+e.a;if(!cc.has(k)){cc.set(k,[]);ccTimes.set(k,[])}cc.get(k).push(e.value);ccTimes.get(k).push(e.t);if(e.a===64){sustainValues.push(e.value);sustainTimes.push(e.t)}}
    if(e.kind==='pitchbend'){pitchValues.push(e.value);pitchTimes.push(e.t)}}
  return {events,velocityByKey,velocityValues,cc,ccTimes,paramCcs:new Set([6,38,96,97,98,99,100,101]),sustainValues,sustainTimes,pitchValues,pitchTimes};
}
