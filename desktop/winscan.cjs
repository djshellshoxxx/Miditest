// Runs the bundled, read-only winscan.ps1 with PowerShell and returns the parsed JSON.
const {execFile}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

function runWindowsScan(root,days){
  return new Promise(resolve=>{
    if(process.platform!=='win32')return resolve({error:'Windows event-log scan is only available on Windows.'});
    const d=Math.min(30,Math.max(1,Math.floor(days)||7));
    const tmp=path.join(os.tmpdir(),'miditest-winscan-'+process.pid+'-'+Date.now()+'.ps1');
    try{fs.writeFileSync(tmp,'﻿'+fs.readFileSync(path.join(root,'winscan.ps1'),'utf8'),'utf8')}catch(e){return resolve({error:'Could not prepare scan script: '+e.message})}
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',tmp],
      {timeout:120000,maxBuffer:64*1024*1024,windowsHide:true,env:{...process.env,MIDITEST_DAYS:String(d)}},
      (err,stdout,stderr)=>{
        fs.rm(tmp,{force:true},()=>{});
        if(err&&!stdout)return resolve({error:'PowerShell failed: '+(err.killed?'timed out after 120 s':err.message)+(stderr?' — '+String(stderr).slice(0,300):'')});
        try{resolve({scan:JSON.parse(String(stdout).trim())})}catch(e){resolve({error:'Scan output could not be parsed: '+e.message})}
      });
  });
}
module.exports={runWindowsScan};
