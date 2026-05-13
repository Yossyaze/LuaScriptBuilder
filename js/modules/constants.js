export const hotkeys = {
  ipadMove: { key: "a", mods: ["ctrl", "shift"] },
  iphoneMove: { key: "z", mods: ["ctrl", "shift"] },
  start: { key: "s", mods: ["ctrl", "shift"] },
  stop: { key: "x", mods: ["ctrl", "shift"] },
  reload: { key: "r", mods: ["ctrl", "shift"] },
  stopAll: { key: "q", mods: ["ctrl", "shift"] },
};

export const hotkeyLabels = {
  ipadMove: "iPad切り替え",
  iphoneMove: "iPhone切り替え",
  start: "開始",
  stop: "停止",
  reload: "再読込",
  stopAll: "一括停止",
};

export const hotkeyDisplayIds = {
  ipadMove: "ipadMoveHotkeyDisplay",
  iphoneMove: "iphoneMoveHotkeyDisplay",
  start: "startHotkeyDisplay",
  stop: "stopHotkeyDisplay",
  reload: "reloadHotkeyDisplay",
  stopAll: "stopAllHotkeyDisplay",
};

export const APP_PRESETS = [
  { name: "QuickTime Player", id: "com.apple.QuickTimePlayerX" },
  { name: "KeyPad", id: "com.atlogic.KeyPad" },
  { name: "Monst EX Master", id: "mnst_ex_master" },
  { name: "iPhone Mirroring", id: "com.apple.ScreenContinuity" }, // カスタムアプリ用
];

export const NEW_STORAGE_KEY = "lua_builder_projects_v1";
export const OLD_STORAGE_KEY = "lua_builder_settings_v1";
