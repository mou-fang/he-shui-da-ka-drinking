const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("hsdq", {
  onWindowMotion(callback) {
    if (typeof callback !== "function") return;
    ipcRenderer.on("window-motion", (_event,data) => {
      try { callback(data); } catch (error) { console.error("window-motion",error); }
    });
  },
  setReminders(options) { return ipcRenderer.invoke("reminders:set", options); }
});
