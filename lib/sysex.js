// SysEx helpers: identity request/reply, hex parsing, validation, checksums, diff. Pure logic.
const MFR={'41':'Roland','42':'Korg','43':'Yamaha','40':'Kawai','44':'Casio','47':'Akai','01':'Sequential','7D':'Educational / non-commercial','7E':'Universal Non-Real Time','7F':'Universal Real Time',
 '00 20 32':'Behringer','00 20 29':'Focusrite / Novation','00 21 09':'Native Instruments','00 20 6B':'Arturia','00 21 1D':'Ableton'};
const H=b=>b.map(x=>x.toString(16).toUpperCase().padStart(2,'0')).join(' ');

export function manufacturerName(idBytes){
  const a=Array.from(idBytes||[]),k=H(a);
  return MFR[k]||'Unknown ('+k+')';
}
export function buildIdentityRequest(deviceId=0x7f){return [0xF0,0x7E,deviceId&0x7f,0x06,0x01,0xF7]}

export function parseIdentityReply(bytes){
  const b=Array.from(bytes||[]);
  if(b.length<15||b[0]!==0xF0||b[1]!==0x7E||b[3]!==0x06||b[4]!==0x02||b[b.length-1]!==0xF7)return null;
  const n=b[5]===0?3:1;
  if(b.length!==5+n+8+1)return null;
  for(let i=1;i<b.length-1;i++)if(b[i]>0x7f)return null;
  const mid=b.slice(5,5+n),p=5+n;
  return {deviceId:b[2],manufacturerId:mid,manufacturerName:manufacturerName(mid),family:b[p]|(b[p+1]<<7),member:b[p+2]|(b[p+3]<<7),revision:b.slice(p+4,p+8),hex:H(b)};
}

export function parseHex(str){
  if(typeof str!=='string')return {error:'Hex input must be text.'};
  const toks=str.split(/[\s,]+/).filter(Boolean),bytes=[];
  for(const t of toks){
    const m=/^(?:0x)?([0-9a-f]{1,2})$/i.exec(t);
    if(!m)return {error:/^(?:0x)?[0-9a-f]+$/i.test(t)&&t.replace(/^0x/i,'').length>2?'Value too large (max FF): '+t:'Invalid hex token: '+t};
    bytes.push(parseInt(m[1],16));
  }
  return {bytes};
}

export function validateSysex(bytes){
  if(!Array.isArray(bytes)||!bytes.length)return 'SysEx is empty.';
  if(bytes[0]!==0xF0)return 'SysEx must start with F0.';
  if(bytes.length<2||bytes[bytes.length-1]!==0xF7)return 'SysEx must end with F7.';
  for(let i=1;i<bytes.length-1;i++){const v=bytes[i];if(!Number.isInteger(v)||v<0||v>0x7f)return 'Byte '+i+' is not 00-7F.'}
  return null;
}

export function checksum(kind,bytes){
  const a=Array.from(bytes||[]);
  if(kind==='xor')return a.reduce((x,v)=>x^v,0)&0x7f;
  const s=a.reduce((x,v)=>x+v,0);
  if(kind==='roland')return (128-s%128)%128;
  if(kind==='twos')return (-s)&0x7f;
  throw new Error('Unknown checksum kind: '+kind);
}

export function diffBytes(a,b){
  const x=Array.from(a||[]),y=Array.from(b||[]),out=[];
  for(let i=0;i<Math.max(x.length,y.length);i++)if(x[i]!==y[i])out.push({offset:i,a:x[i],b:y[i]});
  return out;
}
