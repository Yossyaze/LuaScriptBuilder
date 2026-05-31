import { state, flushActiveProject } from './state.js';
import { hotkeys } from './constants.js';

/**
 * JavaScriptの文字列リテラル用にバックスラッシュとダブルクォーテーションをエスケープする
 * @param {string} s 対象文字列
 * @returns {string} エスケープ済み文字列
 */
function jsString(s) {
  if (!s) return "";
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * 修飾キーの配列を JavaScript の配列リテラル形式の文字列に変換する
 * @param {string[]} mods 修飾キーの配列
 * @returns {string} 配列リテラル文字列
 */
function formatMods(mods) {
  if (!mods || mods.length === 0) {
    return "[]";
  }
  return "[" + mods.map(m => `"${m}"`).join(", ") + "]";
}

/**
 * MultiKeyBoard の ScriptExecutor 環境で動作する JavaScript マクロスクリプトを生成する
 * @returns {string} 生成されたJavaScriptコード
 */
export function generateJavascript() {
  flushActiveProject();

  if (Object.keys(state.projects).length === 0) {
    throw new Error("プロジェクトがありません。");
  }

  const activeProj = state.projects[state.activeProjectId];
  if (!activeProj) {
    throw new Error("アクティブなプロジェクトが見つかりません。");
  }

  const p = activeProj;
  let js = `// =============================================================================
// MultiKeyBoard 用 自動生成スクリプト
// プロジェクト: ${p.name}
// 生成日時: ${new Date().toLocaleString()}
// =============================================================================

sys.log("【開始】プロジェクト: ${jsString(p.name)}");

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

  // UI側の表示順序と完全に一致させるためのフラット化関数
  const getAllStepsFlatLocal = (steps) => {
    let res = [];
    steps.forEach((s) => {
      res.push(s);
      if (s.kind === "check") {
        res = res.concat(getAllStepsFlatLocal(s.okBranch || []));
        res = res.concat(getAllStepsFlatLocal(s.ngBranch || []));
      }
    });
    return res;
  };

  const allSteps = getAllStepsFlatLocal(p.flowSteps);
  const flatSteps = allSteps.map((s, i) => ({
    ...s,
    flatIndex: i + 1,
    displayNum: i + 1
  }));

  /**
   * 指定されたステップの「次」のステップのインデックスを特定する
   */
  const findNextIndex = (step, currentArray, parentAfterIndex) => {
    const idx = currentArray.indexOf(step);
    if (idx < currentArray.length - 1) {
      return allSteps.indexOf(currentArray[idx + 1]) + 1;
    }
    return parentAfterIndex;
  };

  /**
   * 各ステップの okIndex, ngIndex, nextIndex を解決する
   */
  const resolveIndices = (steps, afterIndex) => {
    steps.forEach((s) => {
      const flatS = flatSteps[allSteps.indexOf(s)];
      const nextIdx = findNextIndex(s, steps, afterIndex);
      flatS.jsNextIndex = nextIdx;

      if (s.kind === "check") {
        flatS.jsOkIndex = resolveIndices(s.okBranch || [], nextIdx);
        flatS.jsNgIndex = resolveIndices(s.ngBranch || [], nextIdx);
      }
    });
    return steps.length > 0 ? (allSteps.indexOf(steps[0]) + 1) : afterIndex;
  };

  // インデックスの解決を実行
  resolveIndices(p.flowSteps, null);

  // JS 形式の switch-case 処理に変換して出力
  flatSteps.forEach((s) => {
    js += `      case ${s.displayNum}:\n`;
    
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
      js += `        // 内部のVision OCR（またはショートカット）を実行して画面テキストを取得\n`;
      js += `        let checkResult = sys.runShortcut("GetScreenText", "${jsString(bundleId)}");\n`;
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
      js += `        sys.sleep(${Math.round((s.waitAfter ?? 0.25) * 1000)});\n`;
      js += `        nextStep = ${s.targetId || "null"};\n`;
    } else if (s.kind === "stop") {
      js += `        nextStep = null;\n`;
    } else if (s.kind === "btt") {
      js += `        sys.log("※BetterTouchToolトリガーはMultiKeyBoardでは未サポートです (${jsString(s.triggerName)})");\n`;
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
