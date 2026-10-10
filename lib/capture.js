// Session capture file format (.miditest-capture.json), schema 1. Pure logic, never throws on parse.
export const CAPTURE_MAX_EVENTS=200000;
const MAX_BYTES=4096;

export function serializeCapture(events,meta={}){
  const list=Array.isArray(events)?events:[],t0=list.length?Number(list[0].t)||0:0;
  const m=meta||{};
  return JSON.stringify({kind:'capture',schema:1,app:m.app??null,startedAt:m.startedAt??null,device:m.device??null,ports:m.ports??[],notes:m.notes??'',
    events:list.map(e=>({t:Math.round(((Number(e.t)||0)-t0)*1000)/1000,deviceId:String(e.deviceId??''),bytes:Array.from(e.raw??e.bytes??[])}))});
}

export function parseCapture(text){
  try{
    if(typeof text!=='string')return {error:'Capture is not text.'};
    if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
    let o;try{o=JSON.parse(text)}catch{return {error:'Capture is not valid JSON.'}}
    if(!o||typeof o!=='object'||Array.isArray(o)||o.kind!=='capture')return {error:'Not a MIDItest capture file (kind must be "capture").'};
    if(typeof o.schema!=='number'||o.schema<1)return {error:'Capture schema is missing or invalid.'};
    if(o.schema>1)return {error:'Unsupported capture schema '+o.schema+' (this app reads schema 1).'};
    if(!Array.isArray(o.events))return {error:'Capture events must be an array.'};
    if(o.events.length>CAPTURE_MAX_EVENTS)return {error:'Capture has too many events (max '+CAPTURE_MAX_EVENTS+').'};
    const events=[];let last=-Infinity;
    for(let i=0;i<o.events.length;i++){
      const e=o.events[i],n='Event '+(i+1)+': ';
      if(!e||typeof e!=='object')return {error:n+'not an object.'};
      if(typeof e.t!=='number'||!Number.isFinite(e.t))return {error:n+'t is not a finite number.'};
      if(e.t<last)return {error:n+'time goes backwards.'};
      const b=e.bytes;
      if(!Array.isArray(b)||b.length<1||b.length>MAX_BYTES)return {error:n+'bytes must be an array of 1-'+MAX_BYTES+' values.'};
      for(let j=0;j<b.length;j++)if(!Number.isInteger(b[j])||b[j]<0||b[j]>255)return {error:n+'byte '+j+' is not an integer 0-255.'};
      if(b[0]<0x80)return {error:n+'first byte must be a status byte (>= 0x80).'};
      last=e.t;events.push({t:e.t,deviceId:typeof e.deviceId==='string'?e.deviceId:String(e.deviceId??''),bytes:b.slice()});
    }
    return {events,meta:{device:o.device??null,ports:Array.isArray(o.ports)?o.ports:[],startedAt:o.startedAt??null,notes:typeof o.notes==='string'?o.notes:'',app:o.app??null,schema:o.schema}};
  }catch(err){return {error:'Could not read capture.'}}
}
