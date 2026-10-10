// Windows MIDI/USB log interpretation. Pure functions: take raw records (from winscan.ps1 or pasted/imported logs)
// and return plain-English findings. Nothing here touches the system; collection is done by winscan.ps1.

// Device Manager problem codes (Win32_PnPEntity.ConfigManagerErrorCode).
export const CM_PROBLEMS={
  1:['Device is not configured correctly','Open Device Manager > Properties > Update driver, or reinstall the device.'],
  3:['Driver may be corrupted or the system is low on memory','Restart; if it persists reinstall the driver.'],
  10:['Device cannot start','Common for USB MIDI after a bad enumeration. Unplug, use a different port/cable, reinstall the driver.'],
  12:['Not enough free resources','Move the device to another USB port/controller or unplug other USB devices.'],
  14:['Restart required before the device works','Restart Windows.'],
  18:['Drivers must be reinstalled','Uninstall the device (tick "delete driver software") and reconnect it.'],
  19:['Registry configuration is incomplete or damaged','Reinstall the driver; if it recurs run sfc /scannow.'],
  22:['Device is disabled','Right-click the device in Device Manager > Enable device.'],
  24:['Device is not present, not working properly or drivers not installed','Reconnect the device; reinstall the driver.'],
  28:['Drivers for this device are not installed','Install the manufacturer driver, or for class-compliant devices check Windows Update.'],
  31:['Windows cannot load the driver required for this device','Reinstall the driver. For USB MIDI, check that usbaudio.sys is present and not blocked.'],
  32:['Driver service is disabled','Re-enable the service or reinstall the driver.'],
  37:['Driver returned a failure from its initialisation routine','Install a newer driver from the manufacturer.'],
  38:['Previous driver instance is still in memory','Restart Windows.'],
  39:['Driver is corrupted, missing or incompatible','Reinstall the driver from the manufacturer; check for a Windows-version-specific build.'],
  41:['Driver loaded but the hardware was not found','Check cable/port and power. Reconnect the device.'],
  42:['Duplicate device','Remove the duplicate entry and restart.'],
  43:['Windows stopped this device because it reported problems','Classic "USB device not recognised" state: descriptor/enumeration failure. Try a different cable, a direct (non-hub) port, and disable USB selective suspend.'],
  44:['An application or service shut down the device','Restart the device; check for software that controls it exclusively.'],
  45:['Device is not currently connected','Normal for unplugged devices; reconnect to use it.'],
  48:['Windows blocked this driver because of known problems','Install a newer driver from the manufacturer.'],
  52:['Windows cannot verify the driver\'s digital signature','Use a signed driver. Unsigned/test-signed drivers are blocked on Secure Boot systems.'],
  54:['Device is in a reset transition (ACPI _PS0/_PR0)','Restart; update chipset/USB controller drivers.']
};

// SetupAPI exit status codes seen in setupapi.dev.log.
export const SETUPAPI_CODES={
  '0xe0000203':['No driver selected for the device','The INF did not match. Use the manufacturer\'s installer.'],
  '0xe0000228':['No compatible drivers were found','Windows Update has no driver for this hardware ID; download the manufacturer driver.'],
  '0xe000022f':['No catalog (signature) for this OEM INF','The driver package is unsigned; use a signed package.'],
  '0xe0000242':['Authenticode trust could not be established','The driver\'s signing certificate is not trusted on this PC.'],
  '0xe0000243':['Authenticode publisher is not trusted','The publisher is untrusted; install the publisher certificate or use a WHQL driver.'],
  '0xe0000247':['Adding the driver to the driver store failed','Check disk space/permissions; run the installer as Administrator.'],
  '0xe0000248':['Device installation is blocked by policy','Group Policy or device-installation restrictions are blocking this device.'],
  '0xe0000249':['Driver installation is blocked by policy','Group Policy or Secure Boot is blocking the driver.'],
  '0xe000024b':['Driver file hash is not in the signing catalog','Driver files were modified or corrupted; re-download the driver.'],
  '0xe000023f':['No Authenticode catalog found','Driver package lacks a valid signature.'],
  '0x00000005':['Access denied','Run the installer as Administrator.'],
  '0x00000002':['File not found','A driver file is missing; re-download the package.']
};

export const BUGCHECKS={
  '0x000000fe':['BUGCODE_USB_DRIVER','A USB driver or device caused a blue screen. Suspect the USB MIDI device, hub or controller driver.'],
  '0x0000009f':['DRIVER_POWER_STATE_FAILURE','A driver did not complete a power transition (sleep/resume or selective suspend). Common with USB audio/MIDI devices.'],
  '0x00000133':['DPC_WATCHDOG_VIOLATION','A driver held the CPU too long; real-time audio/MIDI drivers are frequent causes.'],
  '0x000000d1':['DRIVER_IRQL_NOT_LESS_OR_EQUAL','A driver accessed invalid memory. Update or remove the most recently installed MIDI/audio driver.'],
  '0x0000000a':['IRQL_NOT_LESS_OR_EQUAL','Kernel-mode memory fault, often a faulty driver.'],
  '0x0000001e':['KMODE_EXCEPTION_NOT_HANDLED','A kernel driver raised an unhandled exception.'],
  '0x0000007e':['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED','A system thread (often a driver) crashed.'],
  '0x000000c4':['DRIVER_VERIFIER_DETECTED_VIOLATION','Driver Verifier caught a driver misbehaving.']
};

const SCM={
  7000:['A service failed to start','A required service did not start (e.g. Windows Audio or Windows MIDI service). MIDI apps may not see any ports.'],
  7001:['A service depends on another that failed','A dependency chain failed; Windows Audio, Audio Endpoint Builder and Plug and Play must all run.'],
  7009:['Timeout waiting for a service to connect','The service was too slow to start, often because a driver hung during boot.'],
  7011:['Timeout waiting for a service reply','The service hung; usually a misbehaving audio/MIDI driver.'],
  7023:['A service terminated with an error','The service crashed on its own error.'],
  7024:['A service terminated with a service-specific error','The service crashed with a code specific to that service.'],
  7031:['A service terminated unexpectedly (restart attempted)','The service crashed. For Windows Audio/MIDI this drops all MIDI ports until it restarts.'],
  7034:['A service terminated unexpectedly','The service crashed and was not restarted. Restart it from services.msc.']
};

const KEYWORDS=/midi|usb|audio|vid_|wdmaud|usbaudio|midisrv|winmm|ksuser|mmdevapi|endpoint|plug and play|wudf|umdf/i;
const MIDI_MODULES=/winmm|wdmaud|midimap|usbaudio2?\.sys|ksuser|mmdevapi|ksproxy|midisrv|ksthunk/i;
const lc=s=>String(s||'').toLowerCase();

// Classify one event record {time,log,provider,id,level,message}. Returns null if it is not relevant to MIDI/USB.
export function classifyEvent(ev,hints=[]){
  const prov=lc(ev.provider),id=Number(ev.id),msg=String(ev.message||''),m=lc(msg);
  const mentions=hints.some(h=>h&&m.includes(lc(h)));
  const out=(sev,cat,title,explain,action)=>({time:ev.time,source:ev.log+' / '+ev.provider+' #'+ev.id,severity:sev,category:cat,title,explain,action,mentionsDevice:mentions,raw:msg.slice(0,400)});
  if(prov.includes('kernel-pnp')&&id===219)return out('investigate','Driver',
    'A driver failed to load for a device','Windows tried to load a driver (the message names it) for a plug-and-play device and could not. For a USB MIDI device this usually means the class driver (usbaudio.sys) or a vendor driver is missing, blocked or corrupt, and the device will not appear as a MIDI port.','Reinstall the vendor driver or reconnect the device; if it is class-compliant, run Windows Update and check that the device shows no yellow warning in Device Manager.');
  if(prov.includes('kernel-pnp')&&id===411)return out('investigate','Driver',
    'A device had a problem starting','Windows enumerated the device but could not start it. The message lists a problem code and status that match the Device Manager error (for example Code 10 or Code 43).','Open Device Manager and read the code for the device; follow the matching entry in the Devices section below.');
  if(prov.includes('userpnp')&&[20001,20003].includes(id)&&/fail|0xe|error/i.test(msg))return out('investigate','Driver install',
    id===20001?'Driver installation failed':'Driver service installation failed','Windows could not install the driver package or its service. The status code in the message identifies why (unsigned package, blocked by policy, missing files).','Look up the code in the SetupAPI table, then reinstall the driver as Administrator.');
  if(prov.includes('driverframeworks-usermode'))return out('attention','Driver (UMDF)',
    'A user-mode device driver reported a problem','A user-mode driver host (UMDF) for a device failed or restarted. Vendor MIDI/audio drivers and some class drivers run this way; a crash means the device may vanish and reappear.','Update the vendor driver; if it repeats during testing, note the time and device in your report.');
  if(prov.includes('service control manager')&&SCM[id]&&KEYWORDS.test(msg)){const [t,e]=SCM[id];return out(id===7036?'info':'investigate','Service',t,e+' (Service Control Manager event '+id+'.)','Open services.msc and make sure Windows Audio, Windows Audio Endpoint Builder and Plug and Play are running; restart Windows Audio.')}
  if((prov.includes('usbhub')||prov.includes('usbxhci')||prov.includes('usbport')||prov.includes('usbccgp')||prov.includes('usbehci'))&&ev.level<=3)return out('attention','USB',
    'The USB hub/controller reported a problem','Windows logged a warning or error from the USB stack. Typical causes: failed enumeration (device descriptor/set-address failed), port reset failure, over-current, insufficient bandwidth or an unpowered hub. Intermittent MIDI dropouts and "device not recognised" popups come from here.','Connect the device directly to a motherboard USB port with a short, good-quality data cable; avoid unpowered hubs; disable USB selective suspend.');
  if(prov.includes('kernel-power')&&id===41)return out('attention','System',
    'The system rebooted without a clean shutdown','Windows restarted after a crash or power loss. Any MIDI test running at that time is invalid, and a crashing USB driver can be the cause.','Check for a blue screen entry (BugCheck) near this time.');
  if(prov.includes('whea'))return out('investigate','Hardware',
    'Hardware error reported (WHEA)','The CPU/PCIe/USB-controller hardware reported a corrected or fatal error. A failing USB controller or board can look like an unreliable MIDI device.','Update chipset/BIOS, try another USB controller port and, if frequent, test the hardware.');
  if(prov.includes('systemerrorreporting')&&id===1001){const code=(msg.match(/0x[0-9a-f]{8}/i)||[''])[0].toLowerCase(),bc=BUGCHECKS[code];return out('investigate','Blue screen',
    'Windows crashed (bug check '+(code||'unknown')+(bc?' '+bc[0]:'')+')',bc?bc[1]:'Windows reported a bug check after a restart.','Install the latest USB/audio/chipset drivers; analyse the dump in C:\\Windows\\Minidump if it repeats.')}
  if(['application error','application hang','windows error reporting'].some(p=>prov.includes(p))&&MIDI_MODULES.test(msg)){const mod=(msg.match(MIDI_MODULES)||[''])[0];return out('investigate','Application',
    'An application crashed or hung inside the MIDI/audio path ('+mod+')','The faulting module belongs to the Windows MIDI/audio stack or the USB audio driver. The application (often a DAW or MIDI tool) died while talking to a MIDI device.','Update the app and the device driver; try the device without a hub. If the module is a vendor driver, report it to the vendor.')}
  if(ev.level<=3&&(KEYWORDS.test(msg)||mentions))return out(ev.level<=2?'attention':'info','Other',
    'Unclassified Windows '+(ev.level<=2?'error':'warning')+' mentioning USB/audio/MIDI','The event is related to USB, audio or MIDI but does not match a known pattern. Read the message text and search for the provider and event ID.','Search the web for "'+ev.provider+' event '+ev.id+'".');
  return null;
}

export function describeCmProblem(code){const e=CM_PROBLEMS[code];return e?{title:e[0],action:e[1]}:{title:'Device Manager problem code '+code,action:'Search "Device Manager error code '+code+'".'}}
export function describeSetupapiExit(status){const key=lc(status).replace(/^failure\(|\)$/g,'');const e=SETUPAPI_CODES[key];return e?{title:e[0],action:e[1]}:{title:'SetupAPI failure '+key,action:'Search the code in the SetupAPI error list.'}}

// Analyse a winscan.ps1 result object. ctx: {hints:[port names], windowStart:ms epoch of current test}.
export function analyzeWindowsScan(scan,ctx={}){
  const hints=ctx.hints||[],findings=[],start=ctx.windowStart??null;
  for(const ev of scan.events||[]){const c=classifyEvent(ev,hints);if(!c)continue;const ts=Date.parse(ev.time);c.duringTest=start!==null&&Number.isFinite(ts)&&ts>=start-5000;findings.push(c)}
  const devices=(scan.devices||[]).map(d=>{const code=Number(d.errorCode||0);const info=code?describeCmProblem(code):null;
    const driver=(scan.drivers||[]).find(x=>lc(x.deviceId)===lc(d.id));
    if(code&&code!==45)findings.push({time:null,source:'Device Manager',severity:code===45?'info':'investigate',category:'Device',title:(d.name||'Unknown device')+' — Code '+code+': '+info.title,explain:'Device Manager reports this device in a problem state. '+(d.id?'Instance: '+d.id+'.':''),action:info.action,mentionsDevice:hints.some(h=>h&&lc(d.name).includes(lc(h))),duringTest:false,raw:''});
    return {...d,problem:info,driver}});
  for(const s of scan.services||[])if(s.status!=='Running'&&['Audiosrv','AudioEndpointBuilder','PlugPlay','MidiSrv'].includes(s.name)&&!(s.name==='MidiSrv'&&s.startType==='Disabled'))
    findings.push({time:null,source:'Services',severity:s.name==='MidiSrv'?'info':'investigate',category:'Service',title:s.displayName+' ('+s.name+') is '+s.status,explain:s.name==='Audiosrv'||s.name==='AudioEndpointBuilder'?'Windows audio services must run for USB audio/MIDI class devices to appear.':s.name==='PlugPlay'?'Plug and Play must run for devices to be detected.':'The Windows MIDI service is not running (on Windows versions that include it).',action:'Start the service in services.msc (or run: Start-Service '+s.name+').',duringTest:false,raw:'',mentionsDevice:false});
  const sel=scan.usbSelectiveSuspend;if(sel&&/0x00000001/.test(sel.ac||'')||sel&&/0x00000001/.test(sel.dc||''))
    findings.push({time:null,source:'Power plan',severity:'attention',category:'Power',title:'USB selective suspend is enabled',explain:'Windows may power down idle USB ports. Controllers that are quiet for a while can then disconnect and reconnect, which looks like random MIDI dropouts.',action:'Control Panel > Power Options > Change plan settings > Advanced > USB settings > USB selective suspend > Disabled.',duringTest:false,raw:'',mentionsDevice:false});
  // F05 evidence rules (all inputs optional so scans from older versions still analyse).
  const gen=Date.parse(scan.generated||'')||Date.now(),add=(sev,cat,title,explain,action)=>findings.push({time:null,source:'Windows scan',severity:sev,category:cat,title,explain,action,duringTest:false,mentionsDevice:false,raw:''});
  for(const h of scan.usbHistory||[]){if(h.arrivals>5)add('attention','USB','"'+(h.name||'Device')+'" reconnected '+h.arrivals+' times in '+scan.days+' day(s)','Windows started this device '+h.arrivals+' times. Repeated arrivals mean it kept disconnecting and reconnecting (loose cable, power saving, a failing port or hub, or a device that resets itself).','Try a different cable and a motherboard port, disable USB selective suspend, and avoid unpowered hubs.')}
  for(const t of scan.usbTree||[]){const hub=(t.path||[]).slice(1,-1).find(n=>/hub/i.test(n||''));if(hub&&(t.path||[]).length>4)add('info','USB','"'+(t.path[0]||'Device')+'" sits behind '+(t.path.length-3)+' USB hub levels','Devices behind several hubs share bandwidth and power, which can cause dropouts for MIDI/audio devices.','Plug the device directly into a motherboard port to rule the hub chain out.')}
  for(const d of scan.drivers||[]){const age=d.date?(gen-Date.parse(d.date))/31557600000:0;if(d.signed===false)add('investigate','Driver',(d.name||'Driver')+' is not signed','Unsigned drivers can be blocked or unstable on current Windows versions.','Install the manufacturer\'s signed driver.');else if(age>3)add('info','Driver',(d.name||'Driver')+' driver is '+age.toFixed(1)+' years old (version '+(d.version||'?')+', '+(d.provider||'?')+')','Old vendor drivers are a common cause of MIDI dropouts after Windows feature updates.','Check the manufacturer\'s site for a newer driver (class-compliant devices use the built-in Windows driver).')}
  const firstErr=findings.filter(f=>f.time&&f.severity!=='info').map(f=>Date.parse(f.time)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
  if(firstErr&&scan.changes){const recent=[...(scan.changes.driverInstalls||[]).map(x=>[Date.parse(x.time),'driver install']),...(scan.changes.hotfixes||[]).map(x=>[Date.parse(x.installedOn),'Windows update '+x.id])].filter(([t])=>Number.isFinite(t)&&t<=firstErr&&firstErr-t<172800000);
    if(recent.length)add('info','Change','Recent system changes before the first error: '+recent.map(r=>r[1]).slice(0,4).join(', '),'A driver or update was installed within 48 hours before the first MIDI/USB error. Changes are the most common trigger for new device problems.','If the problem started after this change, try rolling back that driver/update or reinstalling the device driver.')}
  const srv=(scan.services||[]).find(x=>x.name==='MidiSrv'),environment={build:scan.build??null,midiServices:!!srv&&srv.status==='Running',midi2Capable:(scan.build||0)>=26100};
  const logs=[];
  for(const b of scan.setupapi||[]){const bad=/failure/i.test(b.exit||'');const d=bad?describeSetupapiExit(b.exit):null;
    logs.push({name:'setupapi.dev.log',time:b.time,summary:b.title+' — '+(bad?'FAILED: '+d.title:'succeeded'),detail:b.warnings?.join('\n')||'',action:d?.action||''});
    if(bad)findings.push({time:b.time,source:'setupapi.dev.log',severity:'investigate',category:'Driver install',title:'Device installation failed: '+b.title,explain:'setupapi.dev.log records every driver installation. This install ended with '+b.exit+': '+d.title+'.',action:d.action,duringTest:false,mentionsDevice:hints.some(h=>h&&lc(b.title).includes(lc(h))),raw:''})}
  for(const w of scan.wer||[])logs.push({name:'Windows Error Reporting',time:w.time,summary:(w.app||'?')+' crashed ('+(w.eventName||'?')+') in '+(w.module||'?'),detail:'Exception '+(w.exception||'?'),action:'The faulting module is part of the MIDI/audio stack; update the app and driver.'});
  const rank={investigate:0,attention:1,info:2};
  findings.sort((a,b)=>(b.duringTest?1:0)-(a.duringTest?1:0)||rank[a.severity]-rank[b.severity]);
  const counts={investigate:findings.filter(f=>f.severity==='investigate').length,attention:findings.filter(f=>f.severity==='attention').length,info:findings.filter(f=>f.severity==='info').length,duringTest:findings.filter(f=>f.duringTest).length};
  return {status:counts.investigate?'investigate':counts.attention?'attention':'ok',counts,findings,devices,logs,
    environment,meta:{generated:scan.generated,os:scan.os,days:scan.days,errors:scan.errors||[],eventsRead:(scan.events||[]).length}};
}

// Explain an arbitrary pasted/imported log file. Recognises setupapi logs, WER reports and generic text.
export function analyzeLogText(name,text){
  const lines=String(text).split(/\r?\n/),out=[];
  if(/setupapi/i.test(name)||/^>>>\s+\[(Device|Driver)/m.test(text)){
    const re=/^>>>\s+\[(.+?)\]\s*$/,ex=/^<<<\s+\[Exit status:\s*(.+?)\]\s*$/i;let cur=null,blocks=0,fails=0;
    for(const l of lines){let m=re.exec(l);if(m){cur=m[1];blocks++;continue}m=ex.exec(l);if(m&&cur){const bad=/failure/i.test(m[1]);if(bad){fails++;const d=describeSetupapiExit(m[1]);out.push({severity:'investigate',title:'Install failed: '+cur,explain:m[1]+' — '+d.title,action:d.action})}cur=null}}
    return {type:'setupapi',summary:blocks+' installation section(s), '+fails+' failed.',findings:out};
  }
  if(/^EventType=|\[Sig\]|Sig\[\d\]\.Name=/m.test(text)){
    const g=k=>(new RegExp('^'+k+'=(.*)$','m').exec(text)||[])[1],mod=(text.match(/Sig\[\d\]\.Name=Fault Module Name\r?\nSig\[\d\]\.Value=(.+)/)||[])[1],code=(text.match(/Sig\[\d\]\.Name=Exception Code\r?\nSig\[\d\]\.Value=(.+)/)||[])[1];
    const mi=MIDI_MODULES.test(mod||'');
    return {type:'wer',summary:'Windows Error Report for '+(g('AppName')||'unknown app')+' ('+(g('EventName')||g('EventType')||'?')+').',findings:[{severity:mi?'investigate':'info',title:(g('AppName')||'App')+' crashed in '+(mod||'unknown module')+(code?' (exception '+code+')':''),explain:mi?'The faulting module belongs to the Windows MIDI/audio stack or USB audio driver.':'The crash was not in a MIDI module, so it is probably unrelated to the MIDI device.',action:mi?'Update the application and the MIDI device driver.':'No MIDI action needed.'}]};
  }
  const hits=lines.map((l,i)=>[i+1,l]).filter(([,l])=>/error|fail|warn|denied|timeout|0x[0-9a-f]{6,}|code \d+/i.test(l)&&KEYWORDS.test(l)).slice(0,40);
  for(const [n,l] of hits){const hex=(l.match(/0x[0-9a-f]{8}/i)||[''])[0].toLowerCase(),sa=SETUPAPI_CODES[hex],bc=BUGCHECKS[hex],cm=(l.match(/code (\d{1,2})\b/i)||[])[1];
    out.push({severity:/error|fail/i.test(l)?'attention':'info',title:'Line '+n+': '+l.trim().slice(0,160),explain:sa?sa[0]:bc?bc[0]+' — '+bc[1]:cm&&CM_PROBLEMS[cm]?'Device Manager code '+cm+': '+CM_PROBLEMS[cm][0]:'Mentions a USB/audio/MIDI component together with an error word.',action:sa?sa[1]:cm&&CM_PROBLEMS[cm]?CM_PROBLEMS[cm][1]:'Read the surrounding lines for the failing component.'})}
  return {type:'generic',summary:lines.length+' line(s) read, '+hits.length+' related to USB/audio/MIDI problems.',findings:out};
}
