// Preload: the ONLY bridge between renderer and main.
// contextIsolation on, nodeIntegration off, sandbox on. No direct Node access.
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  invoke: async (channel: string, payload?: unknown) => {
    const res = await ipcRenderer.invoke(channel, payload);
    if (res && typeof res === 'object' && 'ok' in res) {
      if (!res.ok) throw new Error(res.error || 'Request failed');
      return res.data;
    }
    return res;
  },
};

contextBridge.exposeInMainWorld('shopdesk', api);

declare global {
  interface Window {
    shopdesk: typeof api;
  }
}
