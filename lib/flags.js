// Feature flags backed by a storage-like object (localStorage). Never throws.
export const FLAGS=[['replay','Session replay'],['checklist','Device checklists'],['profiles','Device profiles'],['charts','Charts over time'],['sysex','SysEx tools'],['activeTests','Active tests'],['clockgen','Clock generator'],['multidevice','Multi-device view'],['ump','UMP decoder'],['glossary','Glossary']].map(([id,label])=>({id,label,default:true}));

export function createFlags(storage,key='miditest-flags'){
  const defs=Object.fromEntries(FLAGS.map(f=>[f.id,f.default]));
  const load=()=>{
    const out={...defs};
    try{const o=JSON.parse(storage.getItem(key));if(o&&typeof o==='object'&&!Array.isArray(o))for(const id in defs)if(typeof o[id]==='boolean')out[id]=o[id]}catch{}
    return out;
  };
  return {
    isOn:id=>Object.hasOwn(defs,id)?load()[id]:false,
    set(id,v){if(!Object.hasOwn(defs,id))return;const s=load();s[id]=!!v;try{storage.setItem(key,JSON.stringify(s))}catch{}},
    all:()=>load()
  };
}
