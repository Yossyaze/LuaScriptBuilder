import { APP_PRESETS } from './constants.js';

const STORAGE_KEY = "lua_builder_custom_presets_v1";

/**
 * 全プリセットリストを取得します。
 * 初回ロード時（localStorageが空の場合）は、デフォルトのAPP_PRESETSをコピーして保存します。
 */
export function getAllPresets() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    
    // 初回ロード時は、constants.jsの初期リストをコピーしてローカルストレージに流し込む
    const initialPresets = APP_PRESETS.map(p => ({ ...p }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialPresets));
    return initialPresets;
  } catch (e) {
    console.error("Failed to load presets:", e);
    return APP_PRESETS.map(p => ({ ...p }));
  }
}

/**
 * プリセットリストを保存します。
 */
export function savePresets(presets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error("Failed to save presets:", e);
  }
}

/**
 * 新しいアプリをプリセットに追加します。
 */
export function addCustomPreset(name, id) {
  const cleanName = (name || "").trim();
  const cleanId = (id || "").trim();
  
  if (!cleanName || !cleanId) {
    throw new Error("アプリ名と Bundle ID が正しく指定されていません。");
  }
  
  const presets = getAllPresets();
  if (presets.some(p => p.id === cleanId)) {
    throw new Error(`「${cleanName}」はすでにプリセットに登録されています。`);
  }
  
  presets.push({ name: cleanName, id: cleanId });
  savePresets(presets);
  return true;
}

/**
 * プリセットからアプリを削除します（デフォルト・追加アプリ問わずすべて削除可能です）。
 */
export function deleteCustomPreset(id) {
  const cleanId = (id || "").trim();
  const presets = getAllPresets();
  const initialLength = presets.length;
  
  const filtered = presets.filter(p => p.id !== cleanId);
  if (filtered.length === initialLength) {
    return false;
  }
  
  savePresets(filtered);
  return true;
}
