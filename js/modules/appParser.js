import { findStepById } from './state.js';
import { setStatus } from './ui.js';

/**
 * ユーザーがローカルの .app ディレクトリを選択した際に、
 * その中の Info.plist を解析してアプリ名と Bundle ID を抽出します。
 * 抽出された情報は指定されたステップに反映されます。
 * 
 * @param {Event} event ファイル選択イベント
 * @param {number} stepId 対象となるステップの ID
 */
export async function handleAppSelect(event, stepId) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  setStatus("Info.plist を解析中...");
  let infoPlistFile = null;
  let shortestPathLength = Infinity;
  for (let i = 0; i < files.length; i++) {
    const path = files[i].webkitRelativePath;
    if (path.endsWith("Contents/Info.plist")) {
      const depth = path.split("/").length;
      if (depth < shortestPathLength) {
        shortestPathLength = depth;
        infoPlistFile = files[i];
      }
    }
  }

  let appName = "";
  let bundleId = "";
  if (infoPlistFile) {
    try {
      const text = await infoPlistFile.text();
      const getPlistValue = (xml, key) => {
        const regex = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`);
        const match = xml.match(regex);
        return match ? match[1] : null;
      };
      appName = getPlistValue(text, "CFBundleDisplayName") || getPlistValue(text, "CFBundleName");
      bundleId = getPlistValue(text, "CFBundleIdentifier");
    } catch (e) {
      console.error(e);
    }
  }

  if (!appName) {
    const rootDir = files[0].webkitRelativePath.split("/")[0];
    appName = rootDir.toLowerCase().endsWith(".app") ? rootDir.slice(0, -4) : rootDir;
  }

  const step = findStepById(stepId);
  if (step) {
    step.appName = appName || "";
    step.bundleId = bundleId || "";
    if (typeof window.refreshFlowViews === "function") {
      window.refreshFlowViews();
    }
    setStatus(`アプリ設定を更新しました: ${appName} (${bundleId || "ID取得不可"})`);
  } else {
    setStatus("ステップが見つかりませんでした");
  }
  event.target.value = "";
}
