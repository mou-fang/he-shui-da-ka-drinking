import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// 安卓 WebView 不能依赖 blob: URL 下载。通过文件分享面板让用户明确保存备份。
export async function exportBackup(data, filename) {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    await Filesystem.writeFile({
      path: filename,
      directory: Directory.Cache,
      data,
      encoding: Encoding.UTF8
    });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({
      title: "喝水打卡 · 数据备份",
      text: "将饮水记录保存到文件或云盘，重装之前务必保留此文件。",
      files: [uri],
      dialogTitle: "保存饮水记录备份"
    });
    return;
  }
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
