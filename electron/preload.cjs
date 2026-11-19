// 预加载脚本：只用 contextBridge 向页面暴露一条最小通道，
// 不暴露任何 Node API（页面是纯前端，不需要）。
// window.hsdq.onWindowMotion(cb)：订阅主进程发来的窗口拖动数据
// { vx, vy, ax, ay, speed, energy, t, settled? }，见 electron/window-motion.cjs。
// 网页版里没有 window.hsdq，页面会自己判断、静默跳过。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hsdq", {
  onWindowMotion(cb) {
    ipcRenderer.on("window-motion", (_event, data) => {
      try { cb(data); } catch { /* 单个回调出错不影响后续拖动 */ }
    });
  },
});
