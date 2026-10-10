// Universal MIDI Packet (UMP) decoder. Pure logic; decodeUmp never throws. Channels are reported 1-based (as in midi-core.js).
export const UMP_WORDS={0:1,1:1,2:1,3:2,4:2,5:4,6:1,7:1,8:2,9:2,10:2,11:3,12:3,13:4,14:4,15:4};

// Simple scaling: round(v*127/65535). Not the spec's min-center-max rule (which preserves center and max exactly).
export const scale16to7=v=>Math.round((v&0xffff)*127/65535);
export const scale32to7=v=>Math.round((v>>>0)*127/4294967295);

export function parseUmpHex(text){
  if(typeof text!=='string')return {error:'UMP input must be text.'};
  const words=[];
  for(const t of text.split(/[\s,]+/).filter(Boolean)){
    const m=/^(?:0x)?([0-9a-f]{8})$/i.exec(t);
    if(!m)return {error:'Each UMP word must be exactly 8 hex digits: '+t};
    words.push(parseInt(m[1],16)>>>0);
  }
  return {words};
}

const SYS={0xF1:'timecode',0xF2:'songposition',0xF3:'songselect',0xF6:'tunerequest',0xF8:'clock',0xFA:'start',0xFB:'continue',0xFC:'stop',0xFE:'active',0xFF:'reset'};
const CV1={0x8:'noteoff',0x9:'noteon',0xA:'polyaftertouch',0xB:'cc',0xC:'program',0xD:'aftertouch',0xE:'pitchbend'};
const FSTAT={0:'endpointdiscovery',1:'endpointinfo',2:'deviceidentity',3:'endpointname',4:'productinstanceid',5:'streamconfigrequest',6:'streamconfignotify',16:'functionblockdiscovery',17:'functionblockinfo',18:'functionblockname',32:'startofclip',33:'endofclip'};
const txt=bytes=>bytes.filter(b=>b>=32&&b<127).map(b=>String.fromCharCode(b)).join('');
const wbytes=w=>[w>>>24&255,w>>>16&255,w>>>8&255,w&255];
const hex=(...w)=>w.map(x=>(x>>>0).toString(16).toUpperCase().padStart(8,'0')).join(' ');

function one(w){
  const mt=w[0]>>>28,g=w[0]>>>24&15,st=w[0]>>>16&255,d1=w[0]>>>8&127,d2=w[0]&127,ch=(w[0]>>>16&15)+1;
  const o={mt,group:g,kind:'reserved',channel:null,words:w.length,hex:hex(...w),text:''};
  if(mt===0){
    const s=w[0]>>>20&15,v=w[0]&0xffff;
    if(s===0&&w[0]<<8===0)o.kind='noop';else if(s===1){o.kind='jrclock';o.timestamp=v}else if(s===2){o.kind='jrtimestamp';o.timestamp=v}
    o.text=o.kind==='reserved'?'Reserved utility':o.kind==='noop'?'NOOP':'JR '+(o.kind==='jrclock'?'clock':'timestamp')+' '+v;
  }else if(mt===1){
    o.kind=SYS[st]||'reserved';o.status=st;o.data1=d1;o.data2=d2;o.text=o.kind==='reserved'?'Reserved system message':'System '+o.kind;
  }else if(mt===2){
    const op=w[0]>>>20&15,k=CV1[op];o.channel=ch;o.data1=d1;o.data2=d2;
    if(k){o.kind=k;
      if(op===9&&d2===0)o.kind='noteoff';
      if(op===8||op===9||op===0xA){o.note=d1;o.velocity=d2}
      else if(op===0xB){o.controller=d1;o.value=d2}else if(op===0xC)o.program=d1;else if(op===0xD)o.pressure=d1;else if(op===0xE)o.value=((d2<<7)|d1)-8192;
      o.text='MIDI1 '+o.kind+' ch'+ch+' '+d1+(op===0xC||op===0xD?'':' '+d2);
    }else o.text='Reserved MIDI1 channel voice';
  }else if(mt===3){
    const s=w[0]>>>20&15,n=w[0]>>>16&15,b=[w[0]>>>8&255,w[0]&255,...wbytes(w[1])].slice(0,Math.min(n,6));
    o.kind='sysex7';o.status=['complete','start','continue','end'][s]??'reserved';o.count=n;o.bytes=b;o.text='SysEx7 '+o.status+' '+b.length+' bytes';if(s>3||n>6)o.kind='reserved';
  }else if(mt===4){
    const op=w[0]>>>20&15,note=w[0]>>>8&127,lo=w[0]&255,w1=w[1]>>>0;o.channel=ch;
    const nm={0x8:'noteoff',0x9:'noteon',0xA:'polyaftertouch',0xB:'cc',0xD:'aftertouch',0xE:'pitchbend',0xC:'program'}[op];
    if(nm)o.kind=nm;
    if(op===8||op===9){o.note=note;o.attributeType=lo;o.velocity16=w1>>>16;o.attribute=w1&0xffff;o.velocity7=scale16to7(o.velocity16);o.text='MIDI2 '+nm+' ch'+ch+' note '+note+' vel16 '+o.velocity16+' (7-bit '+o.velocity7+')'}
    else if(op===0xA){o.note=note;o.value32=w1;o.value7=scale32to7(w1);o.text='MIDI2 poly pressure ch'+ch+' note '+note}
    else if(op===0xB){o.controller=note;o.value32=w1;o.value7=scale32to7(w1);o.text='MIDI2 CC '+note+' ch'+ch+' value32 '+w1}
    else if(op===0xD){o.value32=w1;o.value7=scale32to7(w1);o.text='MIDI2 channel pressure ch'+ch}
    else if(op===0xE){o.value32=w1;o.value7=scale32to7(w1);o.text='MIDI2 pitch bend ch'+ch+' value32 '+w1}
    else if(op===0xC){o.bankValid=!!(lo&1);o.program=w1>>>24&127;if(o.bankValid){o.bankMsb=w1>>>8&127;o.bankLsb=w1&127}o.text='MIDI2 program '+o.program+' ch'+ch+(o.bankValid?' bank '+o.bankMsb+'/'+o.bankLsb:'')}
    else o.text='Reserved/other MIDI2 channel voice (opcode '+op+')';
  }else if(mt===5){
    const s=w[0]>>>20&15,n=w[0]>>>16&15;o.kind='sysex8';o.status=['complete','start','continue','end'][s]??'reserved';o.count=n;o.streamId=w[0]>>>8&255;o.text='SysEx8 '+o.status+' stream '+o.streamId+' (header only)';if(s>3)o.kind='reserved';
  }else if(mt===13){
    o.kind='flexdata';o.form=w[0]>>>22&3;o.addr=w[0]>>>20&3;o.channel=(w[0]>>>16&15)+1;o.statusBank=w[0]>>>8&255;o.status=w[0]&255;
    if(o.statusBank===1&&o.status>0||o.statusBank===2)o.text=txt([...wbytes(w[1]),...wbytes(w[2]),...wbytes(w[3])]);
    if(!o.text)o.text='Flex data bank '+o.statusBank+' status '+o.status;
  }else if(mt===15){
    const s=w[0]>>>16&1023;o.kind='stream:'+(FSTAT[s]||'reserved');if(!FSTAT[s])o.kind='reserved';o.status=s;o.form=w[0]>>>26&3;
    if(s===1){o.umpVersionMajor=w[0]>>>8&255;o.umpVersionMinor=w[0]&255;o.text='Endpoint info UMP '+o.umpVersionMajor+'.'+o.umpVersionMinor}
    else if(s===0){o.text='Endpoint discovery'}
    else if(s===3||s===4||s===18){o.text=txt([w[0]>>>8&255,w[0]&255,...wbytes(w[1]),...wbytes(w[2]),...wbytes(w[3])])}
    else o.text=o.kind==='reserved'?'Reserved stream message':o.kind;
    if(s===3)o.kind='endpointname';else if(s===1)o.kind='endpointinfo';else if(s===0)o.kind='endpointdiscovery';
  }else o.text='Reserved message type '+mt.toString(16).toUpperCase();
  return o;
}

export function decodeUmp(words){
  const out=[];
  try{
    const w=Array.from(words||[],x=>(Number(x)||0)>>>0);
    for(let i=0;i<w.length;){
      const mt=w[i]>>>28,n=UMP_WORDS[mt];
      if(i+n>w.length){out.push({mt,group:w[i]>>>24&15,kind:'truncated',channel:null,words:w.length-i,needed:n,hex:hex(...w.slice(i)),text:'Truncated: needs '+n+' words, have '+(w.length-i)});break}
      out.push(one(w.slice(i,i+n)));i+=n;
    }
  }catch(e){out.push({mt:-1,group:0,kind:'reserved',channel:null,text:'Undecodable'})}
  return out;
}
