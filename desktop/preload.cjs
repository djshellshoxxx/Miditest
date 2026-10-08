// Exposes a minimal, read-only bridge to the renderer. The renderer cannot run arbitrary commands.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('miditestDesktop',{
  platform:process.platform,
  scanWindows:days=>ipcRenderer.invoke('miditest:winscan',Number(days)||7)
});
