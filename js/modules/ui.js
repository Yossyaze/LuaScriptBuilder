import { state, normalizeStep, findStepById } from "./state.js";
import { hotkeys, hotkeyLabels, hotkeyDisplayIds, APP_PRESETS } from "./constants.js";
import { num, txt, escapeHtml } from "./utils.js";
import { isFirebaseConfigured } from "./firebase.js";

export function hotkeyToDisplay(hk) {
  if (!hk || !hk.key) return "未設定";
  const m = (hk.mods || [])
    .map((mod) => mod.charAt(0).toUpperCase() + mod.slice(1))
    .join("+");
  return (m ? m + "+" : "") + keyToDisplay(hk.key);
}

export function keyToDisplay(key) {
  if (!key) return "未設定";
  if (key === " " || key === "space") return "SPACE";
  return key.toUpperCase();
}

/**
 * ステップの種類に応じたデフォルト待機秒数（静的な基準値）を取得する
 * @param {object} step 対象ステップ
 * @returns {number} 待機秒数
 */
export function defaultWaitSecondsForStep(step) {
  if (!step) return 0.25;
  const kind = step.kind;
  if (kind === "check") return 0;
  if (kind === "device_switch") return 1.0;
  return 0.25;
}

let stepInfoMap = new Map();
let globalStepOptionsHtml = "";

export function getAllStepsFlat(steps) {
  let res = [];
  steps.forEach((s) => {
    res.push(s);
    if (s.kind === "check") {
      res = res.concat(getAllStepsFlat(s.okBranch || []));
      res = res.concat(getAllStepsFlat(s.ngBranch || []));
    }
  });
  return res;
}

/**
 * ブランチ内のCHECKのネスト深度から必要なグリッドカラム数を計算する。
 * CHECKがないブランチ = 1カラム、CHECKがあるブランチ = ok側カラム + ng側カラム
 */
function calcBranchWidth(steps) {
  let maxWidth = 1;
  for (const step of (steps || [])) {
    if (step.kind === "check") {
      const okW = calcBranchWidth(step.okBranch || []);
      const ngW = calcBranchWidth(step.ngBranch || []);
      maxWidth = Math.max(maxWidth, okW + ngW);
    }
  }
  return maxWidth;
}

function prepareStepMetadata() {
  const flat = getAllStepsFlat(state.flowSteps);
  stepInfoMap.clear();
  const options = [];
  flat.forEach((s, i) => {
    const num = i + 1;
    const label = `Step ${num}`;
    stepInfoMap.set(s.id, { num, label, title: s.title || s.kind });
    options.push(`<option value="${s.id}">Step ${num}: ${escapeHtml(s.title || s.kind)}</option>`);
  });
  globalStepOptionsHtml = options.join("");
}

export function getStepLabelById(id) {
  const info = stepInfoMap.get(id);
  return info ? info.label : "不明";
}

export const icons = {
  ipad: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="12" x2="12" y1="18" y2="18"/></svg>`,
  iphone: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="10" height="18" x="7" y="3" rx="2" ry="2"/><line x1="12" x2="12" y1="17" y2="17"/></svg>`,
  device_switch: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17h16"/><path d="m16 20 4-4-4-4"/><path d="M20 7H4"/><path d="m8 3-4 4 4 4"/></svg>`,
  key: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/></svg>`,
  click: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  focus: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-3-3-3 3"/><path d="m15 18-3-3-3 3"/><path d="M12 3v6"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  jump: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>`,
  stop: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 9h6v6H9z"/></svg>`,
  btt: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m17 7-5-5-5 5"/><path d="m17 17-5 5-5-5"/></svg>`,
  shortcut: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  google: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.14-4.53z" fill="#EA4335"/></svg>`,
  activity: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
};

export function setupAddStepButtons() {
  const mapping = {
    btnFlowAddIPad: icons.ipad,
    btnFlowAddIPhone: icons.iphone,
    btnFlowAddDeviceSwitch: icons.device_switch,
    btnFlowAddKey: icons.key,
    btnFlowAddClick: icons.click,
    btnFlowAddFocus: icons.focus,
    btnFlowAddCheck: icons.check,
    btnFlowAddJump: icons.jump,
    btnFlowAddStop: icons.stop,
    btnFlowAddBTT: icons.btt,
    btnFlowAddShortcut: icons.shortcut,
  };

  Object.entries(mapping).forEach(([id, icon]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.innerHTML = `${icon} <span>${btn.innerText.trim()}</span>`;
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.gap = "8px";
      btn.style.justifyContent = "center";
    }
  });
}

function renderStepCard(step, stepNum, isLast = false) {
  let appIconSrc = "";
  if (step.appName) {
    const preset = APP_PRESETS.find(p => p.name === step.appName);
    const bid = step.bundleId || (preset ? preset.id : "");
    appIconSrc = bid ? `/api/app-icon?bundleId=${bid}` : "";
  }

  let icon = icons.key;
  if (step.kind === "move") {
    icon = step.moveHotkey === "ipadMove" ? icons.ipad : icons.iphone;
  } else if (step.kind === "device_switch") {
    icon = icons.device_switch;
  } else if (step.kind === "click") {
    icon = icons.click;
  } else if (step.kind === "focus") {
    icon = icons.focus;
  } else if (step.kind === "check") {
    icon = icons.check;
  } else if (step.kind === "jump") {
    icon = icons.jump;
  } else if (step.kind === "stop") {
    icon = icons.stop;
  } else if (step.kind === "btt") {
    icon = icons.btt;
  } else if (step.kind === "shortcut") {
    icon = icons.shortcut;
  }

  let displayContent = "";
  let editorContent = "";

  if (step.kind === "move") {
    displayContent = `<p class="flow-value flow-value-hotkey">${hotkeyToDisplay(state.globalSettings[step.moveHotkey] || hotkeys[step.moveHotkey])}</p>`;
    editorContent = `<span class="step-key-label" style="font-size:0.7rem; color:#94a3b8;">固定ステップ</span>`;
  } else if (step.kind === "click") {
    displayContent = `
      <div style="display: flex; flex-direction: column; gap: 5px;">
        <div class="step-key-label-group">
          <div class="app-icon-container" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; overflow: hidden;">
            <img id="app-icon-display-${step.id}" src="${appIconSrc}" style="width: 100%; height: 100%; object-fit: contain; ${appIconSrc ? '' : 'display: none;'}" onerror="this.style.display='none';" />
          </div>
          <input type="text" class="step-input" style="flex:1;" data-field="appName" data-step-id="${step.id}" value="${escapeHtml(step.appName || "")}" placeholder="アプリ名 (クリック対象)" readonly />
          <div class="preset-dropdown-container">
            <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-presets" data-step-id="${step.id}" title="プリセットから選択">★</button>
            <div class="preset-menu hidden" id="preset-menu-${step.id}">
              <div class="preset-apps-list" id="preset-apps-list-${step.id}"></div>
              <div class="preset-menu-divider" id="preset-menu-divider-${step.id}"></div>
              <div class="preset-add-item" data-action="add-to-presets" data-step-id="${step.id}">＋ 現在のアプリを登録</div>
            </div>
          </div>
          <div class="preset-dropdown-container">
            <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-running" data-step-id="${step.id}" style="color: #0ea5e9!important; border-color: #bae6fd!important; background: #f0f9ff!important; display: flex; align-items: center; justify-content: center; padding: 4px 6px!important;" title="起動中のアプリから選択">${icons.activity}</button>
            <div class="preset-menu hidden" id="running-menu-${step.id}">
              <div class="running-apps-list" id="running-apps-list-${step.id}"></div>
            </div>
          </div>
          <button type="button" class="btn-ghost btn-small" data-action="select-app" data-step-id="${step.id}" style="padding: 4px 8px!important; font-size: 0.7rem!important;">選択</button>
          <input type="file" id="file-app-${step.id}" webkitdirectory directory style="display:none;" />
        </div>
        <div class="step-key-label-group" style="gap: 8px;">
          <div style="display:flex; align-items:center; gap:3px;">
            <span class="step-key-label">X</span>
            <input type="number" class="step-input" style="width: 55px;" data-field="x" data-step-id="${step.id}" value="${step.x}" />
          </div>
          <div style="display:flex; align-items:center; gap:3px;">
            <span class="step-key-label">Y</span>
            <input type="number" class="step-input" style="width: 55px;" data-field="y" data-step-id="${step.id}" value="${step.y}" />
          </div>
          <div style="display:flex; align-items:center; gap:3px; margin-left:auto;">
            <span class="step-key-label" title="前面に出るのを待つ時間">待機</span>
            <input type="number" class="step-input" style="width: 48px;" data-field="settleBefore" data-step-id="${step.id}" value="${step.settleBefore}" step="0.1" min="0" />
            <span class="step-key-label">s</span>
          </div>
        </div>
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "focus") {
    displayContent = `
      <div class="step-key-label-group">
        <div class="app-icon-container" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; overflow: hidden;">
          <img id="app-icon-display-${step.id}" src="${appIconSrc}" style="width: 100%; height: 100%; object-fit: contain; ${appIconSrc ? '' : 'display: none;'}" onerror="this.style.display='none';" />
        </div>
        <input type="text" class="step-input" style="flex:1;" data-field="appName" data-step-id="${step.id}" value="${escapeHtml(step.appName || "")}" placeholder="アプリ名 (前面に出す)" readonly />
        <div class="preset-dropdown-container">
          <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-presets" data-step-id="${step.id}" title="プリセットから選択">★</button>
          <div class="preset-menu hidden" id="preset-menu-${step.id}">
            <div class="preset-apps-list" id="preset-apps-list-${step.id}"></div>
            <div class="preset-menu-divider" id="preset-menu-divider-${step.id}"></div>
            <div class="preset-add-item" data-action="add-to-presets" data-step-id="${step.id}">＋ 現在のアプリを登録</div>
          </div>
        </div>
        <div class="preset-dropdown-container">
          <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-running" data-step-id="${step.id}" style="color: #0ea5e9!important; border-color: #bae6fd!important; background: #f0f9ff!important; display: flex; align-items: center; justify-content: center; padding: 4px 6px!important;" title="起動中のアプリから選択">${icons.activity}</button>
          <div class="preset-menu hidden" id="running-menu-${step.id}">
            <div class="running-apps-list" id="running-apps-list-${step.id}"></div>
          </div>
        </div>
        <button type="button" class="btn-ghost btn-small" data-action="select-app" data-step-id="${step.id}" style="padding: 4px 8px!important; font-size: 0.7rem!important;">選択</button>
        <input type="file" id="file-app-${step.id}" webkitdirectory directory style="display:none;" />
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "check") {
    displayContent = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div class="step-key-label-group" style="align-items: center; gap: 8px;">
          <input type="text" class="step-input" style="flex:1;" data-field="text" data-step-id="${step.id}" value="${escapeHtml(step.text || "")}" placeholder="検知するテキストを入力..." />
          <label style="display:flex; align-items:center; gap:4px; font-size:0.75rem; color:#64748b; cursor:pointer; white-space:nowrap;">
            <input type="checkbox" data-field="useRegex" data-step-id="${step.id}" ${step.useRegex ? "checked" : ""} style="width:14px; height:14px; margin:0;" />
            正規表現
          </label>
        </div>
        <div class="step-key-label-group" style="align-items: center; gap: 8px;">
          <div class="app-icon-container" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; overflow: hidden;">
            <img id="app-icon-display-${step.id}" src="${appIconSrc}" style="width: 100%; height: 100%; object-fit: contain; ${appIconSrc ? '' : 'display: none;'}" onerror="this.style.display='none';" />
          </div>
          <input type="text" class="step-input" style="flex:1;" data-field="appName" data-step-id="${step.id}" value="${escapeHtml(step.appName || "")}" placeholder="アプリ名" readonly />
          <div class="preset-dropdown-container">
            <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-presets" data-step-id="${step.id}" title="プリセットから選択">★</button>
            <div class="preset-menu hidden" id="preset-menu-${step.id}">
              <div class="preset-apps-list" id="preset-apps-list-${step.id}"></div>
              <div class="preset-menu-divider" id="preset-menu-divider-${step.id}"></div>
              <div class="preset-add-item" data-action="add-to-presets" data-step-id="${step.id}">＋ 現在のアプリを登録</div>
            </div>
          </div>
          <div class="preset-dropdown-container">
            <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-running" data-step-id="${step.id}" style="color: #0ea5e9!important; border-color: #bae6fd!important; background: #f0f9ff!important; display: flex; align-items: center; justify-content: center; padding: 4px 6px!important;" title="起動中のアプリから選択">${icons.activity}</button>
            <div class="preset-menu hidden" id="running-menu-${step.id}">
              <div class="running-apps-list" id="running-apps-list-${step.id}"></div>
            </div>
          </div>
          <button type="button" class="btn-ghost btn-small" data-action="select-app" data-step-id="${step.id}" style="padding: 4px 8px!important; font-size: 0.7rem!important;">選択</button>
          <input type="file" id="file-app-${step.id}" webkitdirectory directory style="display:none;" />
        </div>
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "jump") {
    // 選択されたターゲットを selected 属性付きで反映させるための正規表現置換、または動的生成
    const optionsWithSelected = globalStepOptionsHtml.replace(
      `value="${step.targetId}"`,
      `value="${step.targetId}" selected`
    );

    displayContent = `
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div class="step-key-label-group" style="flex-wrap: wrap;">
          <span class="step-key-label" style="min-width: 60px;">移動先:</span>
          <select class="step-input" data-field="targetId" data-step-id="${step.id}" style="width: auto;">
            <option value="">-- ステップ選択 --</option>
            ${optionsWithSelected}
          </select>
        </div>
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "stop") {
    displayContent = `
      <div class="step-key-label-group">
        <span class="step-key-label">このステップで実行を停止します</span>
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "btt") {
    displayContent = `
      <div class="step-key-label-group">
        <span class="step-key-label" style="min-width: 80px;">トリガー名:</span>
        <input type="text" class="step-input" style="flex:1;" data-field="triggerName" data-step-id="${step.id}" value="${escapeHtml(step.triggerName || "")}" placeholder="BTTで設定した名前" />
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "shortcut") {
    displayContent = `
      <div class="step-key-label-group">
        <span class="step-key-label" style="min-width: 90px;">ショートカット名:</span>
        <input type="text" class="step-input" style="flex:1;" data-field="shortcutName" data-step-id="${step.id}" value="${escapeHtml(step.shortcutName || "")}" placeholder="ショートカットの名称" />
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "device_switch") {
    const devName = step.deviceName || "";
    const isFav = window.isFavoriteDevice ? window.isFavoriteDevice(devName) : false;
    const favList = window.getFavoriteDevices ? window.getFavoriteDevices() : [];
    
    // オプション生成 (初期状態は常に「お気に入りから選ぶ...」が選択される)
    let optionsHtml = '<option value="" selected>お気に入りから選ぶ...</option>';
    favList.forEach(fav => {
      optionsHtml += `<option value="${escapeHtml(fav)}">${escapeHtml(fav)}</option>`;
    });

    displayContent = `
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <!-- 1行目: 入力欄とトグルボタン -->
        <div class="step-key-label-group" style="align-items: center; gap: 4px;">
          <span class="step-key-label" style="min-width: 80px; flex-shrink: 0;">切替先名:</span>
          <div style="display: flex; gap: 4px; flex: 1; align-items: center; min-width: 0;">
            <input type="text" class="step-input" style="flex: 1; min-width: 0;" data-field="deviceName" data-step-id="${step.id}" value="${escapeHtml(devName)}" placeholder="デバイス名またはMACアドレス" autocomplete="off" autocorrect="off" spellcheck="false" />
            <button type="button" class="btn-fav-toggle" data-action="toggle-favorite-device" data-step-id="${step.id}" style="border: none; background: none; cursor: pointer; font-size: 15px; padding: 2px 4px; color: ${isFav ? '#f5b041' : '#ccc'}; flex-shrink: 0;" title="${isFav ? 'お気に入りから削除' : 'お気に入りに追加'}">
              ${isFav ? '★' : '☆'}
            </button>
          </div>
        </div>
        <!-- 2行目: お気に入り選択用のセレクトパレット -->
        <div class="step-key-label-group" style="align-items: center; gap: 4px;">
          <span class="step-key-label" style="min-width: 80px; flex-shrink: 0; font-size: 11px; color: var(--text-secondary, #666);">お気に入り:</span>
          <select class="step-input-preset" data-step-id="${step.id}" style="flex: 1; min-width: 0; padding: 2px 4px; border-radius: 4px; font-size: 11px; background: var(--bg-card, #fff); border: 1px solid var(--border-color, #ccc); color: var(--text-color, #333);">
            ${optionsHtml}
          </select>
        </div>
      </div>
    `;
    editorContent = "";
  } else {
    displayContent = `
      <div style="display: flex; flex-direction: column; gap: 5px;">
        <div class="step-key-label-group" style="justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
            <span class="step-key-label" style="min-width: 60px;">入力キー:</span>
            <span class="step-key-badge" style="flex-shrink: 0;">${hotkeyToDisplay(step)}</span>
            
            <!-- アプリ名が入力されている場合のみ、1行目（入力キーの右隣）に十分なサイズで待機時間を表示する -->
            ${step.appName ? `
            <div style="display:flex; align-items:center; gap:2px; margin-left:6px; flex-shrink:0;">
              <span class="step-key-label" title="前面に出るのを待つ時間">待機:</span>
              <input type="number" class="step-input" style="width: 60px;" data-field="settleBefore" data-step-id="${step.id}" value="${step.settleBefore}" step="0.1" min="0" />
              <span class="step-key-label">s</span>
            </div>
            ` : ''}
          </div>
          <!-- 記録ボタンを1行目の右側に配置して高さを揃え、絶対に縦書きにならないように保護する -->
          <button type="button" class="record-btn btn-small${state.recordingStepId === step.id ? " recording" : ""}" data-action="record-step" data-step-id="${step.id}" style="white-space: nowrap; flex-shrink: 0; margin-left: 8px;">
            ${state.recordingStepId === step.id ? "入力待ち..." : "記録"}
          </button>
        </div>
        <!-- アプリ前面化（フォーカス）用のUIを追加 -->
        <div class="step-key-label-group">
          <div class="app-icon-container" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; overflow: hidden;">
            <img id="app-icon-display-${step.id}" src="${appIconSrc}" style="width: 100%; height: 100%; object-fit: contain; ${appIconSrc ? '' : 'display: none;'}" onerror="this.style.display='none';" />
          </div>
          <input type="text" class="step-input" style="flex:1; min-width: 0;" data-field="appName" data-step-id="${step.id}" value="${escapeHtml(step.appName || "")}" placeholder="アプリ名 (入力前にフォーカス・任意)" readonly />
          <div class="preset-dropdown-container">
            <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-presets" data-step-id="${step.id}" title="プリセットから選択">★</button>
            <div class="preset-menu hidden" id="preset-menu-${step.id}">
              <div class="preset-apps-list" id="preset-apps-list-${step.id}"></div>
              <div class="preset-menu-divider" id="preset-menu-divider-${step.id}"></div>
              <div class="preset-add-item" data-action="add-to-presets" data-step-id="${step.id}">＋ 現在のアプリを登録</div>
            </div>
          </div>
          <div class="preset-dropdown-container">
            <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-running" data-step-id="${step.id}" style="color: #0ea5e9!important; border-color: #bae6fd!important; background: #f0f9ff!important; display: flex; align-items: center; justify-content: center; padding: 4px 6px!important;" title="起動中のアプリから選択">${icons.activity}</button>
            <div class="preset-menu hidden" id="running-menu-${step.id}">
              <div class="running-apps-list" id="running-apps-list-${step.id}"></div>
            </div>
          </div>
          <button type="button" class="btn-ghost btn-small" data-action="select-app" data-step-id="${step.id}" style="padding: 4px 8px!important; font-size: 0.7rem!important;">選択</button>
          <input type="file" id="file-app-${step.id}" webkitdirectory directory style="display:none;" />
        </div>
      </div>
    `;
    editorContent = ""; // 右側のカラムは空にして、カードの横幅を広く使えるようにする
  }

  const badgeLabel =
    step.kind === "move"
      ? step.moveHotkey === "ipadMove"
        ? "iPad"
        : "iPhone"
      : step.kind === "device_switch"
        ? "DEV_SWITCH"
      : step.kind === "click"
        ? "CLICK"
        : step.kind === "focus"
          ? "FOCUS"
          : step.kind === "check"
            ? "CHECK"
            : step.kind === "jump"
              ? "JUMP"
              : step.kind === "stop"
                ? "STOP"
                : step.kind === "btt"
                  ? "BTT"
                  : step.kind === "shortcut"
                    ? "SHORTCUT"
                    : "KEY";

  const kindClass =
    step.kind === "move"
      ? step.moveHotkey === "ipadMove"
        ? "move"
        : "iphone"
      : step.kind === "device_switch"
        ? "device-switch"
      : step.kind === "click"
        ? "click"
        : step.kind === "focus"
          ? "focus"
          : step.kind === "check"
            ? "check"
            : step.kind === "jump"
              ? "jump"
              : step.kind === "stop"
                ? "stop"
                : step.kind === "btt"
                  ? "btt"
                  : step.kind === "shortcut"
                    ? "shortcut"
                    : "key";

  const activeProj = state.projects[state.activeProjectId];
  const currentPlatform = activeProj ? activeProj.platform : "lua";
  const isUnsupported =
    (currentPlatform === "lua" && step.kind === "device_switch");

  const unsupportedClass = isUnsupported ? " unsupported" : "";
  const unsupportedWarning = isUnsupported
    ? `<span class="unsupported-badge" title="このアクションは現在のターゲットプラットフォーム（${currentPlatform.toUpperCase()}）ではサポートされておらず、スクリプト生成時に無視または警告出力されます">⚠️ 非サポート</span>`
    : "";

  return `
    <article class="flow-step ${kindClass}${state.selectedStepId === step.id ? " selected" : ""}${isLast ? " is-last" : ""}${unsupportedClass}" draggable="true" data-step-id="${step.id}">
      <div class="flow-step-header">
        <div class="flow-step-title">
          <span class="flow-index">${stepNum}</span>
          ${icon}
          <span class="flow-kind flow-kind-${kindClass}">${badgeLabel}</span>
          ${unsupportedWarning}
          <input type="text" class="step-title-input" data-field="title" data-step-id="${step.id}" value="${escapeHtml(step.title || "")}" placeholder="アクション名" />
        </div>
        <button type="button" class="icon-btn" data-action="delete" data-step-id="${step.id}" title="削除">
          <svg pointer-events="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="flow-step-body">
        <div class="flow-value-container">
          ${displayContent}
        </div>
        <div class="flow-edit-inline">
          ${editorContent}
        </div>
      </div>
    </article>
  `;
}

function renderFlowStepsRecursive(
  steps,
  isTopLevel = false,
  branchWaitInfo = null,
  startIndex = 1,
) {
  const nodes = [];
  let currentIdx = startIndex;

  steps.forEach((raw, index) => {
    const step = normalizeStep(raw);
    const stepNum = currentIdx++;
    const hasNext = index < steps.length - 1;

    const okEndsStop =
      step.kind === "check" &&
      step.okBranch &&
      step.okBranch.length > 0 &&
      (step.okBranch[step.okBranch.length - 1].kind === "stop" ||
        step.okBranch[step.okBranch.length - 1].kind === "jump");
    const ngEndsStop =
      step.kind === "check" &&
      step.ngBranch &&
      step.ngBranch.length > 0 &&
      (step.ngBranch[step.ngBranch.length - 1].kind === "stop" ||
        step.ngBranch[step.ngBranch.length - 1].kind === "jump");
    const isStopStep =
      step.kind === "stop" ||
      step.kind === "jump" ||
      (step.kind === "check" && okEndsStop && ngEndsStop);

    const isLoopEnabled = document.getElementById("enableLoop")?.checked;
    const isEffectivelyLast = !hasNext && (!isTopLevel || !isLoopEnabled);
    const stepCardHtml = renderStepCard(step, stepNum, isEffectivelyLast);

    if (step.kind !== "check") {
      nodes.push(stepCardHtml);
    }

    // JUMPステップの場合、ここで待機コネクタとジャンプ先ラベルを追加して終了
    if (step.kind === "jump") {
      const waitSeconds = step.waitAfter ?? defaultWaitSecondsForStep(step);
      const targetDesc = getStepLabelById(step.targetId) || "未設定";
      nodes.push(`
        <div class="flow-jump-group">
          <div class="flow-connector" data-insert-after="${step.id}">
            <div class="flow-connector-pill">
              <span class="flow-connector-dot"></span>
              待機
              <input data-field="waitAfter" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${waitSeconds.toFixed(2)}" />
              s
            </div>
          </div>
          <div class="flow-jump-label">
            <div class="flow-jump-pill">
              ${icons.jump}
              <span>${targetDesc} へジャンプ</span>
            </div>
          </div>
        </div>
      `);
      return; // このステップの処理はここまで
    }

    if (step.kind === "check") {
      const { html: okHtml, nextIdx: nextIdxAfterOk } =
        renderFlowStepsRecursive(
          step.okBranch || [],
          false,
          null,
          currentIdx,
        );
      currentIdx = nextIdxAfterOk;

      const { html: ngHtml, nextIdx: nextIdxAfterNg } =
        renderFlowStepsRecursive(
          step.ngBranch || [],
          false,
          null,
          currentIdx,
        );
      currentIdx = nextIdxAfterNg;

      let mergeClass = "";
      if (okEndsStop && ngEndsStop) mergeClass = " both-ends";
      else if (okEndsStop) mergeClass = " ok-ends";
      else if (ngEndsStop) mergeClass = " ng-ends";

      const okBeforeConnector = `
        <div class="flow-connector is-branch" data-branch-parent-id="${step.id}" data-branch-type="ok" data-is-start="true">
          <div class="flow-connector-pill">
            <span class="flow-connector-dot"></span>
            待機
            <input data-field="okWaitBefore" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${(step.okWaitBefore ?? 0.5).toFixed(2)}" />
            s
          </div>
        </div>
      `;
      const ngBeforeConnector = `
        <div class="flow-connector is-branch" data-branch-parent-id="${step.id}" data-branch-type="ng" data-is-start="true">
          <div class="flow-connector-pill">
            <span class="flow-connector-dot"></span>
            待機
            <input data-field="ngWaitBefore" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${(step.ngWaitBefore ?? 0.5).toFixed(2)}" />
            s
          </div>
        </div>
      `;

      const okSelected =
        state.selectedBranch &&
        state.selectedBranch.checkId === step.id &&
        state.selectedBranch.branchType === "ok";
      const ngSelected =
        state.selectedBranch &&
        state.selectedBranch.checkId === step.id &&
        state.selectedBranch.branchType === "ng";

      const isMergeSelected = state.selectedMergeId === step.id;

      // ネスト分岐のカラム幅を計算
      const okWidth = calcBranchWidth(step.okBranch || []);
      const ngWidth = calcBranchWidth(step.ngBranch || []);
      const totalCols = okWidth + ngWidth;

      nodes.push(`
        <div class="flow-check-block${mergeClass}" style="--ok-cols: ${okWidth}; --total-cols: ${totalCols}">
          <div class="flow-check-card">
            ${stepCardHtml}
          </div>
          <div class="flow-split" style="--ok-cols: ${okWidth}; --total-cols: ${totalCols}" data-parent-check-id="${step.id}">
            <div class="flow-split-col ok${okSelected ? " selected" : ""}${okEndsStop ? " ends-stop" : ""}" style="grid-column: 1 / ${okWidth + 1}" data-branch-type="ok" data-parent-id="${step.id}">
              <div class="flow-split-header${okSelected && state.selectedBranch.selectionType === "header" ? " selected" : ""}" data-branch-type="ok" data-parent-id="${step.id}">✅ OK (見つかった時)</div>
              ${okBeforeConnector}
              ${okHtml || `<div class="flow-split-empty${okSelected && state.selectedBranch.selectionType === "empty" ? " selected" : ""}" data-branch-type="ok" data-parent-id="${step.id}">
                <span class="flow-merge-indicator">↓</span>
                <span class="empty-label">何もしないで合流</span>
                <div class="empty-hint">クリックしてアクションを追加</div>
              </div>`}
              ${okEndsStop ? "" : `<div class="flow-branch-filler"></div>`}
            </div>
            <div class="flow-split-col ng${ngSelected ? " selected" : ""}${ngEndsStop ? " ends-stop" : ""}" style="grid-column: ${okWidth + 1} / ${totalCols + 1}" data-branch-type="ng" data-parent-id="${step.id}">
              <div class="flow-split-header${ngSelected && state.selectedBranch.selectionType === "header" ? " selected" : ""}" data-branch-type="ng" data-parent-id="${step.id}">❌ NG (見つからない時)</div>
              ${ngBeforeConnector}
              ${ngHtml || `<div class="flow-split-empty${ngSelected && state.selectedBranch.selectionType === "empty" ? " selected" : ""}" data-branch-type="ng" data-parent-id="${step.id}">
                <span class="flow-merge-indicator">↓</span>
                <span class="empty-label">何もしないで合流</span>
                <div class="empty-hint">クリックしてアクションを追加</div>
              </div>`}
              ${ngEndsStop ? "" : `<div class="flow-branch-filler"></div>`}
            </div>
          </div>
          <div class="flow-merge${mergeClass}${isMergeSelected ? " selected" : ""}">
            <span class="flow-merge-pill${isMergeSelected ? " selected" : ""}" data-rendered-from="merge" data-action="select-merge" data-parent-id="${step.id}" data-insert-at="end" data-branch-type="ok_ng_merge">↓ 合流</span>
          </div>
        </div>
      `);
    }

    if (isStopStep) {
      // No connector
    } else if (!hasNext) {
      const isLoopEnabled = document.getElementById("enableLoop")?.checked;
      if (isTopLevel && isLoopEnabled) {
        // 末尾の合流ラベル（check）の場合は、直後の待機ピルを表示しない
        if (step.kind !== "check") {
          const waitSeconds = step.waitAfter ?? defaultWaitSecondsForStep(step);
          nodes.push(`
            <div class="flow-connector" data-insert-after="${step.id}">
              <div class="flow-connector-pill">
                <span class="flow-connector-dot"></span>
                待機
                <input data-field="waitAfter" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${waitSeconds.toFixed(2)}" />
                s
              </div>
            </div>
          `);
        }
        
        nodes.push(`
          <div class="flow-loop-connector" data-insert-at="end" data-is-top="true">
            <div class="flow-connector-pill" style="background: #f0f9ff; border-color: #bae6fd; color: #0369a1; padding: 6px 16px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              最初に戻ってループ
            </div>
          </div>
        `);
      } else if (isTopLevel && !isLoopEnabled) {
        nodes.push(`
          <div class="flow-connector"></div>
          <div class="flow-end-connector" data-insert-at="end" data-is-top="true">
            <div class="flow-connector-pill" style="background: #fef2f2; border-color: #fecaca; color: #991b1b; padding: 6px 16px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M9 9h6v6H9z"/></svg>
              実行終了
            </div>
          </div>
        `);
      }
    }

    if (!isStopStep && (hasNext || !isTopLevel) && step.kind !== "check") {
      const waitSeconds = step.waitAfter ?? defaultWaitSecondsForStep(step);
      nodes.push(`
        <div class="flow-connector" data-insert-after="${step.id}">
          <div class="flow-connector-pill">
            <span class="flow-connector-dot"></span>
            待機
            <input data-field="waitAfter" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${waitSeconds.toFixed(2)}" />
            s
          </div>
        </div>
      `);
    }

    // branchWaitInfo (終了時待機用) は廃止。ステップ自身の waitAfter に一本化。
  });

  return { html: nodes.join(""), nextIdx: currentIdx };
}

export function updateFlowPreview() {
  const track = document.getElementById("flowTrack");
  if (!track) return;
  prepareStepMetadata();
  const { html } = renderFlowStepsRecursive(state.flowSteps, true);
  track.innerHTML = html;
  
  if (typeof window.setupStepDragAndDrop === "function") {
    window.setupStepDragAndDrop();
  }
}



export function renderHotkeys() {
  Object.keys(hotkeys).forEach((id) => {
    const displayId = hotkeyDisplayIds[id];
    const el = document.getElementById(displayId);
    if (el) {
      if (state.recordingTarget === id) {
        el.value = "入力待ち...";
        el.classList.add("recording");
      } else {
        let hk = null;
        if (id === "start" || id === "stop") {
          const p = state.projects[state.activeProjectId];
          if (p && p.hotkeys && p.hotkeys[id]) {
            hk = p.hotkeys[id];
          }
        }
        
        if (!hk) {
          hk = state.globalSettings[id] || hotkeys[id];
        }
        
        el.value = hotkeyToDisplay(hk);
        el.classList.remove("recording");
      }

    }

    const btn = document.querySelector(`.record-btn[data-hotkey="${id}"]`);
    if (btn) {
      if (state.recordingTarget === id) {
        btn.textContent = "停止";
        btn.classList.add("recording");
      } else {
        btn.textContent = "記録";
        btn.classList.remove("recording");
      }
    }
  });
}

export function updateProjectTabs(
  projects = state.projects,
  activeProjectId = state.activeProjectId,
  onSelect,
  onAdd,
) {
  const container = document.getElementById("projectSidebarList");
  if (!container || !projects) return;
  container.innerHTML = "";

  const selectCb =
    onSelect ||
    ((id) => {
      if (id === state.activeProjectId) return;
      window.loadProjectState(id);
    });
  const addCb =
    onAdd ||
    (() => {
      if (typeof window.openNewProjectModal === "function") {
        window.openNewProjectModal();
      } else {
        const name = prompt("新しいプロジェクト名", "New Project");
        if (name) window.createNewProject(name);
      }
    });

  // プロジェクトの順序が未設定の場合は、現在のキーから作成
  if (state.projectOrder.length === 0 && Object.keys(projects).length > 0) {
    state.projectOrder = Object.keys(projects);
  }

  state.projectOrder.forEach((id) => {
    const p = projects[id];
    if (!p) return;

    const item = document.createElement("div");
    item.className = `sidebar-project-item${id === activeProjectId ? " active" : ""}`;
    item.dataset.id = id;
    item.draggable = true;

    // プロジェクト名とプラットフォームロゴ
    const nameContainer = document.createElement("div");
    nameContainer.className = "sidebar-project-item-name";
    nameContainer.title = "クリックで読込 / ダブルクリックで名前変更";

    const isLua = (p.platform || "lua") === "lua";
    const logoWrapper = document.createElement("span");
    logoWrapper.style.display = "inline-flex";
    logoWrapper.style.alignItems = "center";
    logoWrapper.style.justifyContent = "center";
    logoWrapper.style.width = "16px";
    logoWrapper.style.height = "16px";
    logoWrapper.style.flexShrink = "0";

    if (isLua) {
      logoWrapper.innerHTML = `<svg class="logo-icon lua" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M.38 10.377l-.272-.037c-.048.344-.082.695-.101 1.041l.275.016c.018-.34.051-.682.098-1.02zM4.136 3.289l-.184-.205c-.258.232-.509.48-.746.734l.202.188c.231-.248.476-.49.728-.717zM5.769 2.059l-.146-.235c-.296.186-.586.385-.863.594l.166.219c.27-.203.554-.399.843-.578zM1.824 18.369c.185.297.384.586.593.863l.22-.164c-.205-.271-.399-.555-.58-.844l-.233.145zM1.127 16.402l-.255.104c.129.318.274.635.431.943l.005.01.245-.125-.005-.01c-.153-.301-.295-.611-.421-.922zM.298 9.309l.269.063c.076-.332.168-.664.272-.986l-.261-.087c-.108.332-.202.672-.28 1.01zM.274 12.42l-.275.01c.012.348.04.699.083 1.043l.273-.033c-.042-.336-.069-.68-.081-1.02zM.256 14.506c.073.34.162.682.264 1.014l.263-.08c-.1-.326-.187-.658-.258-.99l-.269.056zM11.573.275L11.563 0c-.348.012-.699.039-1.044.082l.034.273c.338-.041.68-.068 1.02-.08zM23.221 8.566c.1.326.186.66.256.992l.27-.059c-.072-.34-.16-.682-.262-1.014l-.264.081zM17.621 1.389c-.309-.164-.627-.314-.947-.449l-.107.252c.314.133.625.281.926.439l.128-.242zM15.693.572c-.332-.105-.67-.199-1.01-.277l-.063.268c.332.076.664.168.988.273l.085-.264zM6.674 1.545c.298-.15.606-.291.916-.418L7.486.873c-.317.127-.632.272-.937.428l-.015.008.125.244.015-.008zM23.727 11.588l.275-.01a11.797 11.797 0 0 0-.082-1.045l-.273.033c.041.338.068.682.08 1.022zM13.654.105c-.346-.047-.696-.08-1.043-.098l-.014.273c.339.018.683.051 1.019.098l.038-.273zM9.544.527l-.058-.27c-.34.072-.681.16-1.014.264l.081.262c.325-.099.659-.185.991-.256zM1.921 5.469l.231.15c.185-.285.384-.566.592-.834l-.217-.17c-.213.276-.417.563-.606.854zM.943 7.318l.253.107c.132-.313.28-.625.439-.924l-.243-.128c-.163.307-.314.625-.449.945zM18.223 21.943l.145.234c.295-.186.586-.385.863-.594l-.164-.219c-.272.204-.557.4-.844.579zM21.248 19.219l.217.17c.215-.273.418-.561.607-.854l-.23-.148c-.186.285-.385.564-.594.832zM19.855 20.715l.184.203c.258-.23.51-.479.746-.732l-.201-.188c-.23.248-.477.488-.729.717zM22.359 17.504l.244.129c.162-.307.314-.625.449-.945l-.254-.107a11.27 11.27 0 0 1-.439.923zM23.617 13.629l.273.039c.049-.346.082-.695.102-1.043l-.275-.014c-.018.338-.051.682-.1 1.018zM23.156 15.621l.264.086c.107-.332.201-.67.279-1.01l-.268-.063c-.077.333-.169.665-.275.987zM22.453 6.672c.154.303.297.617.424.932l.256-.104c-.131-.322-.277-.643-.436-.953l-.244.125zM8.296 23.418c.331.107.67.201 1.009.279l.062-.268c-.331-.076-.663-.168-.986-.273l-.085.262zM10.335 23.889c.345.049.696.082 1.043.102l.014-.275c-.339-.018-.682-.051-1.019-.098l-.038.271zM17.326 22.449c-.303.154-.613.297-.926.424l.104.256c.318-.131.639-.275.947-.434l.004-.002-.123-.246-.006.002zM4.613 21.467c.274.213.562.418.854.605l.149-.23c-.285-.184-.565-.385-.833-.592l-.17.217zM12.417 23.725l.009.275c.348-.014.699-.041 1.045-.084l-.035-.271c-.336.041-.68.068-1.019.08zM6.37 22.604c.307.162.625.314.946.449l.107-.254c-.313-.133-.624-.279-.924-.439l-.129.244zM3.083 20.041c.233.258.48.51.734.746l.188-.201c-.249-.23-.49-.477-.717-.729l-.205.184zM14.445 23.475l.059.27c.34-.074.68-.162 1.014-.266l-.082-.262c-.325.099-.659.185-.991.258zM21.18.129A2.689 2.689 0 1 0 21.18 5.507 2.689 2.689 0 1 0 21.18.129zM15.324 15.447c0 .471.314.66.852.66.67 0 1.297-.396 1.297-1.016v-.645c-.23.107-.379.141-1.107.24-.735.109-1.042.306-1.042.761zM12 2.818c-5.07 0-9.18 4.109-9.18 9.18 0 5.068 4.11 9.18 9.18 9.18 5.07 0 9.18-4.111 9.18-9.18 0-5.07-4.11-9.18-9.18-9.18zm-2.487 13.77H5.771v-6.023h.769v5.346h2.974v.677zm4.13 0h-.619v-.67c-.405.57-.811.793-1.446.793-.843 0-1.38-.463-1.38-1.182v-3.271h.686v3c0 .52.347.85.893.85.719 0 1.181-.578 1.181-1.461v-2.389h.686v4.33zm-.53-8.393c0-1.484 1.205-2.689 2.689-2.689s2.688 1.205 2.688 2.689-1.203 2.688-2.688 2.688-2.689-1.203-2.689-2.688zm5.567 7.856v.52c-.223.059-.33.074-.471.074-.34 0-.637-.238-.711-.57-.381.406-.918.637-1.471.637-.877 0-1.422-.463-1.422-1.248 0-.527.256-.916.76-1.123.266-.107.414-.141 1.389-.264.545-.066.719-.191.719-.48v-.182c0-.412-.348-.645-.967-.645-.645 0-.957.24-1.016.77h-.693c.041-1 .686-1.404 1.734-1.404 1.066 0 1.627.412 1.627 1.182v2.412c0 .215.133.338.373.338.041-.002.074-.002.149-.017z"/></svg>`;
    } else {
      logoWrapper.innerHTML = `<svg class="logo-icon js" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z"/></svg>`;
    }
    nameContainer.appendChild(logoWrapper);

    const nameText = document.createTextNode(p.name);
    nameContainer.appendChild(nameText);

    nameContainer.addEventListener("click", () => selectCb(id));
    nameContainer.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (typeof window.renameProject === "function") {
        window.renameProject(id);
      }
    });
    item.appendChild(nameContainer);

    // アクションボタン（複製 & 削除）
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "project-item-actions";

    // 複製ボタン
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.className = "project-item-action-btn duplicate";
    dupBtn.title = "プロジェクトを複製";
    dupBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    dupBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof window.duplicateProject === "function") {
        window.duplicateProject(id);
      }
    });
    actionsContainer.appendChild(dupBtn);

    // 削除ボタン
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "project-item-action-btn delete";
    deleteBtn.title = "プロジェクトを削除";
    deleteBtn.innerHTML = `&times;`;
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof window.deleteProject === "function") {
        window.deleteProject(id);
      }
    });
    actionsContainer.appendChild(deleteBtn);

    item.appendChild(actionsContainer);

    // ドラッグ＆ドロップのイベント
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
      item.classList.add("dragging");
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      container
        .querySelectorAll(".sidebar-project-item")
        .forEach((t) => t.classList.remove("drag-over"));
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      if (draggedId !== id && typeof window.reorderProjects === "function") {
        window.reorderProjects(draggedId, id);
      }
    });

    container.appendChild(item);
  });

  // サイドバー上の追加ボタンにイベントを接続
  const addBtn = document.getElementById("btnSidebarAddProject");
  if (addBtn) {
    addBtn.onclick = addCb;
  }

  // 生成対象プロジェクトのリストも再描画
  updateGenProjectList();
}

/**
 * 認証状態に応じてUIを更新
 */
export function updateAuthUI(user, syncStatus = state.sync.status) {
  const container = document.getElementById('authSection');
  if (!container) return;

  // Firebaseが設定されていない場合
  if (!isFirebaseConfigured()) {
    container.innerHTML = `
      <div style="font-size: 0.75rem; color: var(--warn); background: #fffbeb; padding: 4px 10px; border: 1px solid #fef3c7; border-radius: 8px; max-width: 200px; line-height: 1.2;">
        ⚠️ Firebase未設定<br>
        <span style="font-size: 0.7rem; opacity: 0.8;">デプロイ環境の設定を確認してください</span>
      </div>
    `;
    return;
  }

  // クラウド同期状態に応じたアイコンと設定
  const cloudOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.14a7 7 0 0 1 14.28 1.13c.27-.06.56-.09.85-.09a5 5 0 0 1 5 5c0 1.25-.46 2.4-1.21 3.29"/><path d="M16 16.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"/><path d="M12 13V8"/><path d="M3 3l18 18"/><path d="M20 20a4.5 4.5 0 0 1-8 0"/></svg>`;
  
  let cloudSvg = cloudOffSvg;
  let cloudClass = "cloud-off";
  let titleText = "クラウド同期未接続（ログインしてください）";

  if (user) {
    titleText = "クラウド同期済み";
    if (syncStatus === 'syncing') {
      cloudClass = "cloud-syncing";
      titleText = "同期中...";
      cloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`; // ループ矢印
    } else if (syncStatus === 'error') {
      cloudClass = "cloud-error";
      titleText = "同期エラー";
      cloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 2.5-8.25A7 7 0 1 0 6.5 11.25A4.5 4.5 0 0 0 7.5 19Z"/><path d="m10.11 9.3 6.3 6.3m0-6.3-6.3 6.3"/></svg>`; // エラー雲
    } else {
      cloudClass = "cloud-ok";
      titleText = "同期完了";
      cloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 2.5-8.25A7 7 0 1 0 6.5 11.25A4.5 4.5 0 0 0 7.5 19Z"/><path d="m9 13 2 2 4-4"/></svg>`; // チェック雲
    }
  }

  // アカウントステータス情報
  const accountStatusText = user ? "Account Status" : "Not Signed In";
  const accountName = user ? (user.displayName || user.email) : "未ログイン";
  const userPhoto = user ? user.photoURL : "";

  // 最終同期時刻
  let lastSyncedText = '';
  if (user && state.sync.lastSyncedAt) {
    const date = new Date(state.sync.lastSyncedAt);
    lastSyncedText = `同期: ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  } else if (user) {
    lastSyncedText = '未同期';
  } else {
    lastSyncedText = 'ログインしてデータを同期';
  }

  // アクションボタンとガイドテキスト
  const actionButton = user 
    ? `<button id="btnAuthLogout" class="auth-popover-btn logout">
         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
         <span>ログアウト</span>
       </button>`
    : `<button id="btnAuthLogin" class="auth-popover-btn login">
         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
         <span>Google ログイン</span>
       </button>`;

  const guideText = user
    ? `<div class="auth-popover-guide">
         <p>プロジェクトは自動的に<br>クラウドへ同期されます</p>
       </div>`
    : "";

  container.innerHTML = `
    <div class="auth-container" id="authContainer">
      <button type="button" class="auth-cloud-btn ${cloudClass}" id="authCloudBtn" title="${titleText}">
        ${cloudSvg}
      </button>
      
      <div class="auth-popover hidden" id="authPopover">
        <div class="auth-popover-header">
          <div class="auth-popover-user">
            ${userPhoto 
              ? `<img src="${userPhoto}" class="auth-popover-avatar" alt="Avatar">` 
              : `<div class="auth-popover-avatar-placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`
            }
            <div class="auth-popover-info">
              <span class="auth-popover-status">${accountStatusText}</span>
              <span class="auth-popover-name" title="${escapeHtml(accountName)}">${escapeHtml(accountName)}</span>
              <span class="auth-popover-sync-time">${lastSyncedText}</span>
            </div>
          </div>
        </div>
        <div class="auth-popover-body">
          ${actionButton}
        </div>
        ${guideText}
      </div>
    </div>
  `;

  // ポップオーバーのトグル処理
  const btn = document.getElementById("authCloudBtn");
  const popover = document.getElementById("authPopover");
  if (btn && popover) {
    btn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = !popover.classList.contains("hidden");
      if (isOpen) {
        popover.classList.add("hidden");
        btn.classList.remove("active");
      } else {
        popover.classList.remove("hidden");
        btn.classList.add("active");
      }
    };
  }

  // ログイン処理バインド
  const loginBtn = document.getElementById("btnAuthLogin");
  if (loginBtn) {
    loginBtn.onclick = () => {
      if (typeof window.handleLogin === "function") {
        window.handleLogin();
      }
    };
  }

  // ログアウト処理バインド
  const logoutBtn = document.getElementById("btnAuthLogout");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      if (typeof window.handleLogout === "function") {
        window.handleLogout();
      }
    };
  }
}

let statusTimeout = null;

/**
 * 操作メッセージを左下のトースト通知（ポップアップ）として表示する
 * @param {string} msg 表示するメッセージ
 * @param {boolean} isError エラー表示かどうか
 */
export function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;

  // 実行中のタイマーがあればクリアする
  if (statusTimeout) {
    clearTimeout(statusTimeout);
  }

  // エラーか成功かに応じた美しい Feather/Lucide スタイルの SVG アイコンを生成
  const icon = isError
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  el.innerHTML = `${icon}<span>${escapeHtml(msg)}</span>`;
  el.className = isError ? "error show" : "ok show";

  // 3秒後にトーストをフェードアウトして非表示にする
  statusTimeout = setTimeout(() => {
    el.classList.remove("show");
  }, 3000);
}

/**
 * 出力カード上部に表示する、生成対象プロジェクトの一覧を描画する
 */
export function updateGenProjectList() {
  const container = document.getElementById("genProjectList");
  if (!container) return;

  const langRadio = document.querySelector('input[name="genLanguage"]:checked');
  const lang = langRadio ? langRadio.value : 'lua';

  const filteredProjects = Object.values(state.projects).filter(p => p.platform === lang);

  if (filteredProjects.length === 0) {
    container.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-secondary, #666);">対象のプロジェクトがありません。</span>`;
    return;
  }

  let html = '';
  if (lang === 'lua') {
    // Luaの場合は複数選択可能（チェックボックス、デフォルト全選択）
    filteredProjects.forEach(p => {
      html += `
        <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.85rem; background: var(--bg-card, #f8fafc); padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-color, #e2e8f0); color: var(--text-color, #334155);">
          <input type="checkbox" name="genProjects" value="${p.id}" checked style="width: auto; margin: 0;" />
          ${escapeHtml(p.name)}
        </label>
      `;
    });
  } else {
    // JSの場合は単一選択（ラジオボタン、デフォルトはアクティブプロジェクト優先）
    filteredProjects.forEach(p => {
      const isSelected = p.id === state.activeProjectId || filteredProjects[0].id === p.id;
      html += `
        <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.85rem; background: var(--bg-card, #f8fafc); padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-color, #e2e8f0); color: var(--text-color, #334155);">
          <input type="radio" name="genProjects" value="${p.id}" ${isSelected ? 'checked' : ''} style="width: auto; margin: 0;" />
          ${escapeHtml(p.name)}
        </label>
      `;
    });
  }

  container.innerHTML = html;
}

// ポップオーバー以外の場所をクリックしたときにポップオーバーを閉じる処理
document.addEventListener("click", (e) => {
  const popover = document.getElementById("authPopover");
  const btn = document.getElementById("authCloudBtn");
  if (!popover || !btn) return;
  
  if (!btn.contains(e.target) && !popover.contains(e.target)) {
    popover.classList.add("hidden");
    btn.classList.remove("active");
  }
});

