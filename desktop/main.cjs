// MIDItest desktop shell: serves the static web app from a privileged app:// origin so Web MIDI
// (which requires a secure context) works offline, and grants only MIDI-related permissions.
const {app,BrowserWindow,protocol,net,session,shell,Menu,ipcMain}=require('electron');
const {runWindowsScan}=require('./winscan.cjs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const ROOT=path.join(__dirname,'..');
const ORIGIN='app://miditest';
const ALLOWED_PERMISSIONS=new Set(['midi','midiSysex','clipboard-sanitized-write']);

protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);

if(!app.requestSingleInstanceLock())app.quit();

function serveApp(request){
  const rel=decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/,'')||'index.html';
  const file=path.normalize(path.join(ROOT,rel));
  if(file!==ROOT&&!file.startsWith(ROOT+path.sep))return new Response('Not found',{status:404});
  return net.fetch(pathToFileURL(file).toString());
}

function openExternal(url){if(/^https?:\/\//i.test(url))shell.openExternal(url)}

function createWindow(){
  const win=new BrowserWindow({
    width:1360,height:900,minWidth:420,minHeight:500,
    title:'MIDItest',backgroundColor:'#07101a',
    icon:path.join(ROOT,'build','icon.png'),
    webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,preload:path.join(__dirname,'preload.cjs')}
  });
  win.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return {action:'deny'}});
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(ORIGIN+'/')){event.preventDefault();openExternal(url)}});
  win.loadURL(ORIGIN+'/index.html');
  return win;
}

app.on('second-instance',()=>{const [win]=BrowserWindow.getAllWindows();if(win){if(win.isMinimized())win.restore();win.focus()}});

app.whenReady().then(()=>{
  protocol.handle('app',serveApp);
  ipcMain.handle('miditest:winscan',(event,days)=>{
    if(!event.senderFrame||!event.senderFrame.url.startsWith(ORIGIN+'/'))return {error:'Untrusted sender.'};
    return runWindowsScan(ROOT,days);
  });
  session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(ALLOWED_PERMISSIONS.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc,permission)=>ALLOWED_PERMISSIONS.has(permission));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'File',submenu:[{role:'reload',label:'Reload (clears session)'},{type:'separator'},{role:'quit'}]},
    {label:'Edit',submenu:[{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'},{role:'toggleDevTools'}]},
    {label:'Help',submenu:[{label:'MIDItest on the web',click:()=>openExternal('https://djshellshoxxx.github.io/Miditest/')},{label:'Circuit Drift Labs',click:()=>openExternal('https://djshellshoxxx.github.io/circuitdriftlabs/')}]}
  ]));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});

app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
