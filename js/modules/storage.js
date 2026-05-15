import { state, flushActiveProject } from './state.js';
import { hotkeys, NEW_STORAGE_KEY, OLD_STORAGE_KEY } from './constants.js';
import { saveUserData } from './firebase.js';

export function saveToStorage() {
  flushActiveProject();

  const data = {
    activeProjectId: state.activeProjectId,
    projects: state.projects,
    globalSettings: state.globalSettings,
    projectOrder: state.projectOrder,
    lastUpdatedAt: new Date().toISOString(), // タイムスタンプを追加
  };
  localStorage.setItem(NEW_STORAGE_KEY, JSON.stringify(data));

  // Firebaseに同期
  if (state.user) {
    saveUserData(state.user.uid, data);
  }
}

export function loadFromStorage(callbacks) {
  const newJson = localStorage.getItem(NEW_STORAGE_KEY);
  if (newJson) {
    try {
      const data = JSON.parse(newJson);
      applyDataToState(data, callbacks);
      return true;
    } catch (e) {
      console.error("Failed to load new storage format", e);
    }
  }

  // Fallback/Migration from old storage
  const oldJson = localStorage.getItem(OLD_STORAGE_KEY);
  if (oldJson) {
    try {
      const oldData = JSON.parse(oldJson);
      const defaultId = "proj-" + Date.now();
      state.projects[defaultId] = {
        id: defaultId,
        name: "Default Project",
        hotkeys: oldData.hotkeys || {},
        flowSteps: oldData.flowSteps || [],
        config: oldData.config || {},
        stepIdSeq: oldData.stepIdSeq || 1,
        templateStepIds: oldData.templateStepIds || {},
      };
      if (oldData.hotkeys) {
        if (oldData.hotkeys.reload) {
          state.globalSettings.reloadHotkey = oldData.hotkeys.reload;
          hotkeys.reload = oldData.hotkeys.reload;
        }
        if (oldData.hotkeys.ipadMove) {
          state.globalSettings.ipadMove = oldData.hotkeys.ipadMove;
          hotkeys.ipadMove = oldData.hotkeys.ipadMove;
        }
        if (oldData.hotkeys.iphoneMove) {
          state.globalSettings.iphoneMove = oldData.hotkeys.iphoneMove;
          hotkeys.iphoneMove = oldData.hotkeys.iphoneMove;
        }
      }
      state.activeProjectId = defaultId;
      callbacks.loadProjectState(defaultId);
      saveToStorage();
      return true;
    } catch (e) {
      console.error("Failed to migrate from old storage", e);
    }
  }
  return false;
}

/**
 * 取得したデータを状態に反映
 * @param {object} data - 反映するデータ
 * @param {object} callbacks - コールバック
 * @param {boolean} append - true の場合、既存のプロジェクトを上書きせず末尾に追加する
 */
export function applyDataToState(data, callbacks, append = false) {
  if (!data) return;

  if (append) {
    // 追加モード: 現在のプロジェクトを維持し、クラウドのものを末尾に追加
    const cloudProjects = data.projects || {};
    const cloudOrder = data.projectOrder || Object.keys(cloudProjects);
    
    cloudOrder.forEach(id => {
      let targetId = id;
      const projectData = cloudProjects[id];
      if (!projectData) return;

      // IDが衝突する場合（既にある場合）は、クラウド側を別IDとして扱う
      if (state.projects[targetId]) {
        targetId = `cloud-${id}-${Date.now()}`;
        // プロジェクト内のIDフィールドも同期
        projectData.id = targetId;
      }
      
      state.projects[targetId] = projectData;
      if (!state.projectOrder.includes(targetId)) {
        state.projectOrder.push(targetId);
      }
    });

    // globalSettings は常にクラウド側の最新に合わせる（マージ）
    if (data.globalSettings) {
      Object.assign(state.globalSettings, data.globalSettings);
    }
    
    // 追加モードでは activeProjectId は変更しない（現在の作業を邪魔しない）
    
  } else {
    // 全反映モード: 従来の挙動
    state.projects = data.projects || {};
    const loadedOrder = data.projectOrder || [];
    const projectIds = Object.keys(state.projects);
    state.projectOrder = [
      ...loadedOrder.filter(id => projectIds.includes(id)),
      ...projectIds.filter(id => !loadedOrder.includes(id))
    ];

    if (data.globalSettings) {
      Object.assign(state.globalSettings, data.globalSettings);
    }

    const savedActiveId = data.activeProjectId;
    if (savedActiveId && state.projects[savedActiveId]) {
      callbacks.loadProjectState(savedActiveId);
    } else {
      const firstKey = Object.keys(state.projects)[0];
      if (firstKey) callbacks.loadProjectState(firstKey);
    }
  }
}
