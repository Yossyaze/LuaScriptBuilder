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
 */
export function applyDataToState(data, callbacks) {
  if (!data) return;

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
