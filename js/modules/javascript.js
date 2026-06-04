import { state, flushActiveProject } from './state.js';
import { hotkeys } from './constants.js';

// ==========================================
// ユーティリティ関数定義
// ==========================================

/**
 * JavaScript の文字列リテラル用にバックスラッシュとダブルクォーテーションをエスケープします。
 * 
 * @param {string} s 対象文字列
 * @returns {string} エスケープ済み文字列
 */
function jsString(s) {
  if (!s) return "";
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * 修飾キーの配列を JavaScript の配列リテラル形式の文字列に変換します。
 * 
 * @param {string[]} mods 修飾キーの配列
 * @returns {string} 配列リテラル文字列
 */
function formatMods(mods) {
  if (!mods || mods.length === 0) {
    return "[]";
  }
  return "[" + mods.map(m => `"${m}"`).join(", ") + "]";
}

// ==========================================
// ヘルパー関数定義 (インデックス解決関連)
// ==========================================

/**
 * ネストされたステップも含めて、すべてのステップをフラットな配列にして返します。
 */
function getAllStepsFlatLocal(steps) {
  let res = [];
  steps.forEach((s) => {
    res.push(s);
    if (s.kind === "check") {
      res = res.concat(getAllStepsFlatLocal(s.okBranch || []));
      res = res.concat(getAllStepsFlatLocal(s.ngBranch || []));
    }
  });
  return res;
}

/**
 * 指定されたステップの「次」のステップのフラットなインデックス（1-based）を特定します。
 */
function findNextIndex(step, currentArray, parentAfterIndex, allSteps) {
  const idx = currentArray.indexOf(step);
  if (idx < currentArray.length - 1) {
    return allSteps.indexOf(currentArray[idx + 1]) + 1;
  }
  return parentAfterIndex;
}

/**
 * 再帰的に各ステップの okIndex, ngIndex, nextIndex のフラットインデックスを解決してオブジェクトに付与します。
 */
function resolveIndices(steps, afterIndex, allSteps, flatSteps) {
  steps.forEach((s) => {
    const flatS = flatSteps[allSteps.indexOf(s)];
    const nextIdx = findNextIndex(s, steps, afterIndex, allSteps);
    flatS.jsNextIndex = nextIdx;

    if (s.kind === "check") {
      flatS.jsOkIndex = resolveIndices(s.okBranch || [], nextIdx, allSteps, flatSteps);
      flatS.jsNgIndex = resolveIndices(s.ngBranch || [], nextIdx, allSteps, flatSteps);
    }
  });
  return steps.length > 0 ? (allSteps.indexOf(steps[0]) + 1) : afterIndex;
}

/**
 * 個別のステップを JavaScript の switch-case ブロック内のコード文字列にシリアライズします。
 */
function serializeStepToJS(s, stepIdToDisplayNum) {
  let js = `      case ${s.displayNum}:\n`;
  js += `      {\n`;
  
  let typeLabel = s.kind.toUpperCase();
  if (s.kind === "move") {
    typeLabel = s.moveHotkey === "ipadMove" ? "IPAD" : "IPHONE";
  } else if (s.kind === "device_switch") {
    typeLabel = "DEV_SWITCH";
  }
  
  js += `        logStep(${s.displayNum}, "${typeLabel}", "${jsString(s.title || s.kind)}");\n`;

  if (s.kind === "move") {
    const hk = state.globalSettings[s.moveHotkey] || hotkeys[s.moveHotkey] || { key: "a", mods: ["ctrl", "shift"] };
    js += `        keyboard.stroke("${jsString(hk.key)}", ${formatMods(hk.mods)});\n`;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 1.0) * 1000)});\n`;
    js += `        nextStep = ${s.jsNextIndex || "null"};\n`;
  } else if (s.kind === "device_switch") {
    js += `        device.switch("${jsString(s.deviceName)}");\n`;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 1.0) * 1000)});\n`;
    js += `        nextStep = ${s.jsNextIndex || "null"};\n`;
  } else if (s.kind === "key") {
    if (s.appName) {
      js += `        sys.focus("${jsString(s.appName)}");\n`;
      js += `        sys.sleep(${Math.round((s.settleBefore ?? Number(state.globalSettings.settleBeforeKey || 0.2)) * 1000)});\n`;
    }
    js += `        keyboard.stroke("${jsString(s.key)}", ${formatMods(s.mods || [])});\n`;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 0.25) * 1000)});\n`;
    js += `        nextStep = ${s.jsNextIndex || "null"};\n`;
  } else if (s.kind === "click") {
    js += `        sys.click("${jsString(s.appName)}", ${s.x}, ${s.y}, ${s.settleBefore ?? 0.1});\n`;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 0.25) * 1000)});\n`;
    js += `        nextStep = ${s.jsNextIndex || "null"};\n`;
  } else if (s.kind === "focus") {
    js += `        sys.focus("${jsString(s.appName)}");\n`;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 0.25) * 1000)});\n`;
    js += `        nextStep = ${s.jsNextIndex || "null"};\n`;
  } else if (s.kind === "check") {
    const bundleId = s.bundleId || s.appName || "";
    js += `        // 内部のVision OCRを実行して画面テキストを取得\n`;
    js += `        let checkResult = sys.getScreenText("${jsString(bundleId)}");\n`;
    js += `        let cleanResult = checkResult.replace(/\\n/g, " ");\n`;
    js += `        let truncatedResult = cleanResult.length > 200 ? cleanResult.substring(0, 200) + "..." : cleanResult;\n`;
    if (s.useRegex) {
      js += `        let regex = new RegExp("${jsString(s.text)}");\n`;
      js += `        let matchObj = checkResult.match(regex);\n`;
      js += `        let matched = !!matchObj;\n`;
      js += `        let matchedText = matched ? matchObj[0] : "";\n`;
    } else {
      js += `        let matched = checkResult.indexOf("${jsString(s.text)}") !== -1;\n`;
      js += `        let matchedText = matched ? "${jsString(s.text)}" : "";\n`;
    }
    js += `        sys.log("【判定】ターゲット: '${jsString(s.text)}' | 結果: " + (matched ? "一致 [マッチ箇所: '" + matchedText + "']" : "不一致") + " | 取得テキスト(一部): [" + truncatedResult + "]");\n`;
    js += `        if (matched) {\n`;
    js += `          sys.sleep(${Math.round((s.okWaitBefore ?? 0.5) * 1000)});\n`;
    js += `          nextStep = ${s.jsOkIndex || "null"};\n`;
    js += `        } else {\n`;
    js += `          sys.sleep(${Math.round((s.ngWaitBefore ?? 0.5) * 1000)});\n`;
    js += `          nextStep = ${s.jsNgIndex || "null"};\n`;
    js += `        }\n`;
  } else if (s.kind === "jump") {
    const targetIndex = stepIdToDisplayNum.get(s.targetId) || s.jsNextIndex || null;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 0.25) * 1000)});\n`;
    js += `        nextStep = ${targetIndex || "null"};\n`;
  } else if (s.kind === "stop") {
    js += `        nextStep = null;\n`;
  } else if (s.kind === "btt") {
    js += `        sys.log("【BTTトリガー】トリガー名: '${jsString(s.triggerName)}' を実行します");\n`;
    js += `        sys.openUrl("btt://trigger_named/?trigger_name=" + encodeURIComponent("${jsString(s.triggerName)}"));\n`;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 0.25) * 1000)});\n`;
    js += `        nextStep = ${s.jsNextIndex || "null"};\n`;
  } else if (s.kind === "shortcut") {
    js += `        sys.runShortcut("${jsString(s.shortcutName)}", "");\n`;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 0.25) * 1000)});\n`;
    js += `        nextStep = ${s.jsNextIndex || "null"};\n`;
  } else {
    js += `        keyboard.stroke("${jsString(s.key || "space")}", []);\n`;
    js += `        sys.sleep(${Math.round((s.waitAfter ?? 0.25) * 1000)});\n`;
    js += `        nextStep = ${s.jsNextIndex || "null"};\n`;
  }
  
  js += `        break;\n`;
  js += `      }\n`;
  return js;
}

// ==========================================
// メインのスクリプト生成関数
// ==========================================

/**
 * MultiKeyBoard の ScriptExecutor 環境で動作する JavaScript マクロスクリプトを生成します。
 * 
 * @param {string} targetProjectId 生成対象のプロジェクト ID
 * @returns {string} 生成された JavaScript コード
 */
export function generateJavascript(targetProjectId) {
  flushActiveProject();

  if (Object.keys(state.projects).length === 0) {
    throw new Error("プロジェクトがありません。");
  }

  const projId = targetProjectId || state.activeProjectId;
  const p = state.projects[projId];
  if (!p) {
    throw new Error("指定されたプロジェクトが見つかりません。");
  }

  // 全ステップを平坦化（ネストされた分岐もスキャン対象とするため）
  const allSteps = getAllStepsFlatLocal(p.flowSteps);

  // デバイス切り替えステップから、重複を除いたデバイス名一覧を抽出
  const deviceNames = Array.from(new Set(
    allSteps.filter(s => s.kind === "device_switch" && s.deviceName).map(s => s.deviceName)
  ));

  let js = `// =============================================================================
// MultiKeyBoard 用 自動生成スクリプト
// プロジェクト: ${p.name}
// 生成日時: ${new Date().toLocaleString()}
// =============================================================================

`;

  if (deviceNames.length > 0) {
    js += `// @devices ${deviceNames.join(", ")}\n\n`;
  }

  js += `sys.log("【開始】プロジェクト: ${jsString(p.name)}");`;

  js += `
const enableTimelineLog = ${p.config.enableTimelineLog || "true"};
const enableLoop = ${p.config.enableLoop || "true"};

// 各ステップの進行ログを出力する関数
function logStep(stepNum, stepType, label, detail) {
  if (!enableTimelineLog) return;
  let msg = "Step " + stepNum + " | " + stepType + " | " + label;
  if (detail) {
    msg += " | " + detail;
  }
  sys.log(msg);
}

let cycleCount = 1;

while (true) {
  if (enableTimelineLog) {
    sys.log("--- 周回 " + cycleCount + " 開始 ---");
  }

  let nextStep = 1;
  
  while (nextStep !== null) {
    switch (nextStep) {
`;

  const flatSteps = allSteps.map((s, i) => ({
    ...s,
    flatIndex: i + 1,
    displayNum: i + 1
  }));
  const stepIdToDisplayNum = new Map(flatSteps.map((s) => [s.id, s.displayNum]));

  // インデックスの解決を実行
  resolveIndices(p.flowSteps, null, allSteps, flatSteps);

  // JS 形式の switch-case 処理に変換して出力
  flatSteps.forEach((s) => {
    js += serializeStepToJS(s, stepIdToDisplayNum);
  });

  js += `      default:\n`;
  js += `        nextStep = null;\n`;
  js += `        break;\n`;
  js += `    }\n`;
  js += `  }\n`;

  js += `
  if (!enableLoop) {
    break;
  }
  cycleCount++;
  sys.sleep(10);
}

sys.log("【停止】プロジェクト: ${jsString(p.name)}");
`;

  return js;
}
