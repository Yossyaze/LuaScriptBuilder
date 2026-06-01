

export const state = {
  projects: {},
  activeProjectId: null,
  selectedStepId: null,
  selectedBranch: null,
  selectedMergeId: null,
  globalSettings: {
    reloadHotkey: { key: "r", mods: ["ctrl", "shift"] },
    ipadMove: { key: "a", mods: ["ctrl", "shift"] },
    iphoneMove: { key: "z", mods: ["ctrl", "shift"] },
    stopAllHotkey: { key: "q", mods: ["ctrl", "shift"] },
    // 待機時間グローバル設定
    settleIPad: "1.00",
    settleIPhone: "1.00",
    waitKey: "0.25",
    settleBeforeKey: "0.20", // キー送信時のフォーカス待機時間のグローバルデフォルト
    waitClick: "0.25",
    waitFocus: "0.25",
    waitCheck: "0.25",
    waitBtt: "0.25",
    waitShortcut: "0.25",
  },
  recordingTarget: null,
  recordingStepId: null,
  stepIdSeq: 1,
  flowSteps: [],
  templateStepIds: {},
  projectOrder: [],
  user: null,
  sync: {
    isApplyingCloudData: false,
    isManualLogin: false,
    lastSyncedAt: null,
    status: 'synced', // 'synced', 'syncing', 'error'
  },
};

export function nextStepId() {
  const id = state.stepIdSeq;
  state.stepIdSeq += 1;
  return id;
}

export function findStepById(stepId, steps) {
  const list = steps || state.flowSteps;
  for (const step of list) {
    if (step.id === stepId) return step;
    if (step.kind === "check") {
      if (step.okBranch) {
        const found = findStepById(stepId, step.okBranch);
        if (found) return found;
      }
      if (step.ngBranch) {
        const found = findStepById(stepId, step.ngBranch);
        if (found) return found;
      }
    }
  }
  return null;
}

export function flushActiveProject() {
  if (!state.activeProjectId || !state.projects[state.activeProjectId]) return;
  const p = state.projects[state.activeProjectId];
  // p.hotkeys は各プロジェクトで独立して保持されるため、ここでは上書きしない

  p.flowSteps = [...state.flowSteps];
  p.stepIdSeq = state.stepIdSeq;
  p.templateStepIds = { ...state.templateStepIds };
  p.config = {
    enableTimelineLog: document.getElementById("enableTimelineLog").checked ? "true" : "false",
    enableAutoStopLog: document.getElementById("enableAutoStopLog").checked ? "true" : "false",
    enableExecutionAlert: document.getElementById("enableExecutionAlert").checked ? "true" : "false",
    enableLoop: document.getElementById("enableLoop").checked ? "true" : "false",
  };
}

export function defaultTitleByKind(kind, moveHotkey) {
  if (kind === "move") {
    if (moveHotkey === "iphoneMove") return "iPhoneへ切り替え";
    return "iPadへ切り替え";
  }
  if (kind === "device_switch") return "デバイス切り替え";
  if (kind === "click") return "アプリの座標クリック";
  if (kind === "focus") return "アプリを前面出す";
  if (kind === "check") return "画面テキスト確認";
  if (kind === "stop") return "実行停止";
  if (kind === "jump") return "ジャンプ";
  if (kind === "btt") return "BTTトリガー";
  if (kind === "shortcut") return "ショートカット実行";
  return "キー送信";
}

export function migrateLegacyAction(action, targetId) {
  if (action === "stop") {
    return [
      {
        id: nextStepId(),
        kind: "stop",
        title: "実行停止",
        phase: "Custom",
        waitAfter: 0.25,
      },
    ];
  }
  if (action === "jump" && targetId) {
    return [
      {
        id: nextStepId(),
        kind: "jump",
        title: "ジャンプ",
        phase: "Custom",
        targetId: Number(targetId),
        waitAfter: 0.25,
      },
    ];
  }
  return [];
}

export function normalizeWaitAfter(value, fallback) {
  const numValue = Number(value);
  if (Number.isFinite(numValue) && numValue >= 0) return numValue;
  return fallback;
}

export function normalizeStep(step) {
  const kind = step.kind;
  const moveHotkey = kind === "move" ? (step.moveHotkey || "ipadMove") : null;

  const s = {
    id: step.id,
    kind: kind,
    phase: (step.phase || "Custom").trim() || "Custom",
    title:
      (step.title || defaultTitleByKind(kind, moveHotkey)).trim() ||
      defaultTitleByKind(kind, moveHotkey),
  };

  if (s.kind === "move") {
    s.moveHotkey = step.moveHotkey || "ipadMove";
  } else if (s.kind === "click") {
    s.appName = (step.appName || "mnst_ex_master").trim();
    s.bundleId = (step.bundleId || "").trim();
    s.x = Number.isFinite(Number(step.x)) ? Number(step.x) : 178;
    s.y = Number.isFinite(Number(step.y)) ? Number(step.y) : 545;
    s.settleBefore = Number.isFinite(Number(step.settleBefore))
      ? Number(step.settleBefore)
      : 0.2;
  } else if (s.kind === "focus") {
    s.appName = (step.appName || "KeyPad").trim();
    s.bundleId = (step.bundleId || "").trim();
  } else if (s.kind === "check") {
    s.text = (step.text || "").trim();
    s.useRegex = !!step.useRegex;
    s.bundleId = (step.bundleId || "").trim();
    s.appName = (step.appName || "QuickTime Player").trim();
    s.okWaitBefore = normalizeWaitAfter(step.okWaitBefore, 0.5);
    s.ngWaitBefore = normalizeWaitAfter(step.ngWaitBefore, 0.5);
    s.okBranch = Array.isArray(step.okBranch)
      ? step.okBranch.map((bs) => normalizeStep(bs))
      : [];
    s.ngBranch = Array.isArray(step.ngBranch)
      ? step.ngBranch.map((bs) => normalizeStep(bs))
      : [];
    if (!Array.isArray(step.okBranch) && step.ifFoundAction) {
      s.okBranch = migrateLegacyAction(
        step.ifFoundAction,
        step.ifFoundTargetId,
      );
    }
    if (!Array.isArray(step.ngBranch) && step.ifNotFoundAction) {
      s.ngBranch = migrateLegacyAction(
        step.ifNotFoundAction,
        step.ifNotFoundTargetId,
      );
    }
  } else if (s.kind === "jump") {
    s.targetId = step.targetId ? Number(step.targetId) : null;
  } else if (s.kind === "device_switch") {
    s.deviceName = (step.deviceName || "").trim();
  } else if (s.kind === "stop") {
    // No extra fields
  } else if (s.kind === "btt") {
    s.triggerName = (step.triggerName || "").trim();
  } else if (s.kind === "shortcut") {
    s.shortcutName = (step.shortcutName || "").trim();
  } else {
    s.kind = "key";
    s.key = (step.key || "space").trim().toLowerCase() || "space";
    s.mods = Array.isArray(step.mods) ? step.mods : [];
    // アプリ前面化（フォーカス）機能用のフィールドを追加
    s.appName = step.appName !== undefined ? (step.appName || "").trim() : "";
    s.bundleId = (step.bundleId || "").trim();
    s.settleBefore = Number.isFinite(Number(step.settleBefore)) ? Number(step.settleBefore) : 0.2;
  }
  
  // 各ステップのデフォルト待機秒数を静的なフォールバックで定義する（共通設定変更による既存ステップの意図しない上書きを防ぐため）
  const defaultWait = s.kind === "check" ? 0 : (s.kind === "device_switch" ? 1.0 : 0.25);

  s.waitAfter = normalizeWaitAfter(step.waitAfter, defaultWait);
  return s;
}
