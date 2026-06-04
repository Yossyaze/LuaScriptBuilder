import { state, flushActiveProject } from './state.js';
import { saveToStorage } from './storage.js';
import { setStatus } from './ui.js';

/**
 * すべてのデータを JSON ファイルとしてエクスポート（ダウンロード）します。
 */
export function exportAllData() {
  flushActiveProject();
  const data = {
    activeProjectId: state.activeProjectId,
    projects: state.projects,
    globalSettings: state.globalSettings,
    projectOrder: state.projectOrder,
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const a = document.createElement("a");
  a.href = url;
  a.download = `luascriptbuilder-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("データをエクスポートしました");
}

/**
 * 選択された JSON ファイルからプロジェクトデータをインポートします。
 * 重複するプロジェクトIDがある場合は、自動的に別IDを採番してコピーとして追加します。
 * 
 * @param {Event} event ファイル選択イベント
 * @param {Object} options 外部コールバック用オブジェクト
 * @param {Function} options.saveHistory 履歴保存用コールバック
 * @param {Function} options.loadProjectState プロジェクトロード用コールバック
 */
export function importAllData(event, { saveHistory, loadProjectState }) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.projects) {
        throw new Error("無効なデータ形式です");
      }

      if (!confirm("インポートしたプロジェクトを追加します。よろしいですか？")) {
        event.target.value = "";
        return;
      }

      if (saveHistory) saveHistory(); // インポート前を履歴に保存
      
      let firstImportedId = null;
      
      // プロジェクトの追加処理
      const projectOrder = data.projectOrder || Object.keys(data.projects);
      projectOrder.forEach((id, idx) => {
        const project = data.projects[id];
        if (!project) return;
        
        let targetId = id;
        // IDが重複した場合は新IDを割り当てて別プロジェクトにする
        if (state.projects[targetId]) {
          targetId = "proj-" + (Date.now() + idx) + "-" + Math.floor(Math.random() * 1000);
          project.id = targetId;
          project.name = project.name + " (コピー)";
        }
        
        state.projects[targetId] = project;
        if (!state.projectOrder.includes(targetId)) {
          state.projectOrder.push(targetId);
        }
        if (!firstImportedId) {
          firstImportedId = targetId;
        }
      });

      // インポートした最初のプロジェクトをアクティブにする
      if (firstImportedId && state.projects[firstImportedId]) {
        if (loadProjectState) {
          loadProjectState(firstImportedId);
        } else if (window.loadProjectState) {
          window.loadProjectState(firstImportedId);
        }
      } else {
        const firstId = state.projectOrder[0] || Object.keys(state.projects)[0];
        if (firstId) {
          if (loadProjectState) {
            loadProjectState(firstId);
          } else if (window.loadProjectState) {
            window.loadProjectState(firstId);
          }
        }
      }

      saveToStorage();
      setStatus("プロジェクトを追加インポートしました");
    } catch (err) {
      console.error(err);
      alert("インポートに失敗しました: " + err.message);
    }
    event.target.value = "";
  };
  reader.readAsText(file);
}
