import { state, flushActiveProject } from './state.js';
import { hotkeys } from './constants.js';
import { luaString } from './utils.js';

export function modsToLua(mods) {
  if (mods.length === 0) {
    return "{}";
  }
  return "{" + mods.map((m) => `\"${m}\"`).join(", ") + "}";
}

export function generateLua() {
  flushActiveProject();

  if (Object.keys(state.projects).length === 0) {
    throw new Error("プロジェクトがありません。");
  }

  if (!state.globalSettings.reloadHotkey || !state.globalSettings.reloadHotkey.key) {
    throw new Error("再読込ホットキーが未設定です。");
  }

  const reloadModsLua = modsToLua(state.globalSettings.reloadHotkey.mods);
  const reloadKeyLua = luaString(state.globalSettings.reloadHotkey.key);
  const stopAllModsLua = modsToLua(state.globalSettings.stopAllHotkey.mods);
  const stopAllKeyLua = luaString(state.globalSettings.stopAllHotkey.key);

  let lua = `-- ==========================================
-- 共通ライブラリ・ファクトリ関数
-- ==========================================
local function nowTimestamp()
  local t = hs.timer.secondsSinceEpoch()
  local sec = math.floor(t)
  local ms = math.floor((t - sec) * 1000)
  return os.date("%H:%M:%S", sec) .. string.format(".%03d", ms)
end

-- ==========================================
-- ログ保存用ユーティリティ
-- ==========================================
local LOG_DIR = os.getenv("HOME") .. "/Desktop/LuaScriptBuilder/logs/"

local function ensureLogDir()
  local attributes = hs.fs.attributes(LOG_DIR)
  if not attributes then
    hs.fs.mkdir(LOG_DIR)
  end
end

local function appendLog(msg)
  ensureLogDir()
  local f = io.open(LOG_DIR .. "current.log", "a")
  if f then
    f:write(msg .. "\\n")
    f:close()
  end
end

local function archiveLog(sequenceName)
  ensureLogDir()
  local currentPath = LOG_DIR .. "current.log"
  local attributes = hs.fs.attributes(currentPath)
  if not attributes then return end

  local timestamp = os.date("%Y%m%d_%H%M%S")
  -- ファイル名に使用できない文字を置換
  local safeName = (sequenceName or "unknown"):gsub("[%s/\\\\?%%*:|\\"<> ]", "_")
  local newPath = LOG_DIR .. string.format("log_%s_%s.log", safeName, timestamp)
  
  os.rename(currentPath, newPath)
  print("Log archived: " .. newPath)
end

local function logStep(enableTimelineLog, cycleCount, step, detail)
  if not enableTimelineLog then return end
  local msg = string.format("%s | cycle=%d | %s", nowTimestamp(), cycleCount, step)
  if detail and detail ~= "" then
    msg = msg .. " | " .. detail
  end
  print(msg)
  appendLog(msg)
end

local function showAlert(config, message)
  if not config.enableExecutionAlert then return end
  hs.alert.show(message, 1)
end

local function createSequence(config)
  local running = false
  local cycleCount = 0
  local stop -- 前方参照用に宣言

  local stepIdToIndex = {}
  for i, s in ipairs(config.steps) do
    stepIdToIndex[s.id] = i
  end

  -- 正規表現マッチング用のヘルパー
  local function checkRegexMatch(text, pattern)
    if not text or text == "" then return false, nil end
    local tmp = os.tmpname()
    local f = io.open(tmp, "w")
    if f then
      f:write(text)
      f:close()
      local qPattern = "'" .. pattern:gsub("'", "'\\\\''") .. "'"
      local qTmp = "'" .. tmp:gsub("'", "'\\\\''") .. "'"
      local output, status = hs.execute(string.format("/usr/bin/grep -oE %s %s", qPattern, qTmp))
      os.remove(tmp)
      if status then
        return true, (output or ""):gsub("\\\\n", " "):sub(1, 100)
      end
    end
    return false, nil
  end

  local function runStep(index)
    if not running then return end
    
    if not index or index <= 0 or index > #config.steps then
      logStep(config.enableTimelineLog, cycleCount, "CYCLE_END", "completed")
      if config.enableLoop then
        -- タイマーを介してループ
        config._timer = hs.timer.doAfter(0.01, function()
          config._timer = nil
          if running then
            cycleCount = cycleCount + 1
            logStep(config.enableTimelineLog, cycleCount, "CYCLE_BEGIN", "started (" .. config.name .. ")")
            runStep(1)
          end
        end)
      else
        stop("全ステップ終了", config.enableAutoStopLog)
      end
      return
    end

    local s = config.steps[index]
    local frontApp = hs.application.frontmostApplication()
    local frontAppName = frontApp and frontApp:name() or "Unknown"

    local stepLabel = string.format("STEP=%s index=%d", s.displayNum or "?", index)
    logStep(config.enableTimelineLog, cycleCount, stepLabel, string.format("type=%s label=%s | focus=%s", s.type, s.label, frontAppName))
    showAlert(config, string.format("[%s] Step %d: %s", config.name, s.displayNum or 0, s.label))

    if s.type == "stop" then
      stop("STOPステップ", config.enableAutoStopLog)
      return
    elseif s.type == "jump" then
      local nextIdx = nil
      if s.targetId then nextIdx = stepIdToIndex[s.targetId] end
      local wait = s.waitAfter or 0.25
      config._timer = hs.timer.doAfter(wait, function()
        config._timer = nil
        if not running then return end
        if nextIdx then
          logStep(config.enableTimelineLog, cycleCount, "JUMP", "to index=" .. nextIdx)
          runStep(nextIdx)
        else
          runStep(s.nextIndex)
        end
      end)
      return
    elseif s.type == "check" then
      local task = hs.task.new("/usr/bin/shortcuts", function(exitCode, stdOut, stdErr)
        if not running then return end

        local matched = false
        local matchedText = nil
        if exitCode == 0 and stdOut then
          if s.useRegex then
            matched, matchedText = checkRegexMatch(stdOut, s.text)
          else
            local start, finish = string.find(stdOut, s.text, 1, true)
            if start then
              matched = true
              matchedText = string.sub(stdOut, start, finish)
            end
          end
        end

        local cleanOut = (stdOut or ""):gsub("\\\\n", " "):sub(1, 200)
        local logDetail = string.format("pattern=%s | screen=%s", s.text, cleanOut)
        local waitBefore = 0.5
        local nextIdx = nil

        if matched then
          logDetail = logDetail .. string.format(" | matched=%s", matchedText or "")
          logStep(config.enableTimelineLog, cycleCount, "CHECK_MATCH", logDetail)
          waitBefore = s.okWaitBefore or 0.5
          nextIdx = s.okIndex
        else
          logStep(config.enableTimelineLog, cycleCount, "CHECK_NO_MATCH", logDetail)
          waitBefore = s.ngWaitBefore or 0.5
          nextIdx = s.ngIndex
        end
        
        logStep(config.enableTimelineLog, cycleCount, "BRANCH_WAIT_START", string.format("%.2fs", waitBefore))
        config._timer = hs.timer.doAfter(waitBefore, function()
          config._timer = nil
          if not running then return end
          runStep(nextIdx)
        end)
      end, {"run", "GetScreenText"})
      
      if s.bundleId and s.bundleId ~= "" then
        task:setInput(s.bundleId)
      end
      task:start()
      return
    elseif s.type == "move" then
      local modsStr = table.concat(s.mods or {}, ",")
      logStep(config.enableTimelineLog, cycleCount, "KEY_MOVE", string.format("key=%s mods=[%s] focus=%s", s.key, modsStr, frontAppName))
      hs.eventtap.keyStroke(s.mods or {}, s.key, 0)
    elseif s.type == "click" then
      local app = hs.application.find(s.appName)
      if app then
        app:activate()
      else
        hs.application.launchOrFocus(s.appName)
      end
      config._timer = hs.timer.doAfter(s.settleBefore or 0.5, function()
        if not running then return end
        local ca = hs.application.find(s.appName)
        if ca then
          local win = ca:mainWindow()
          if win then
            local f = win:frame()
            local orig = hs.mouse.absolutePosition()
            hs.eventtap.leftClick({x = f.x + s.x, y = f.y + s.y})
            hs.timer.usleep(10000)
            hs.mouse.absolutePosition(orig)
          end
        end
        local wait = s.waitAfter or 0.25
        config._timer = hs.timer.doAfter(wait, function()
          config._timer = nil
          if not running then return end
          runStep(s.nextIndex)
        end)
      end)
      return
    elseif s.type == "focus" then
      hs.application.launchOrFocus(s.appName)
    elseif s.type == "key" then
      local modsStr = table.concat(s.mods or {}, ",")
      -- アプリ名が指定されている場合：前面化（フォーカス）してからキー送信
      if s.appName and s.appName ~= "" then
        local app = hs.application.find(s.appName)
        if app then
          app:activate()
        else
          hs.application.launchOrFocus(s.appName)
        end
        
        config._timer = hs.timer.doAfter(s.settleBefore or 0.2, function()
          if not running then return end
          
          local currentApp = hs.application.frontmostApplication()
          local currentAppName = currentApp and currentApp:name() or "Unknown"
          logStep(config.enableTimelineLog, cycleCount, "KEY_PRESS", string.format("key=%s mods=[%s] focus=%s", s.key or "space", modsStr, currentAppName))
          hs.eventtap.keyStroke(s.mods or {}, s.key or "space", 0)
          
          -- キー入力完了後、ステップ本来の待機時間（waitAfter）待ってから次へ
          local wait = s.waitAfter or 0.25
          config._timer = hs.timer.doAfter(wait, function()
            config._timer = nil
            if not running then return end
            runStep(s.nextIndex)
          end)
        end)
        return -- タイマーコールバック内で後続処理を行うため、ここで処理を終了する
      else
        -- アプリ指定がない場合：従来通り即座にキー送信
        logStep(config.enableTimelineLog, cycleCount, "KEY_PRESS", string.format("key=%s mods=[%s] focus=%s", s.key or "space", modsStr, frontAppName))
        hs.eventtap.keyStroke(s.mods or {}, s.key or "space", 0)
      end
    elseif s.type == "btt" then
      logStep(config.enableTimelineLog, cycleCount, "BTT_TRIGGER", string.format("name=%s", s.triggerName or ""))
      hs.osascript.applescript('tell application "BetterTouchTool" to trigger_named_async_without_response "' .. (s.triggerName or "") .. '"')
    elseif s.type == "shortcut" then
      logStep(config.enableTimelineLog, cycleCount, "SHORTCUT_RUN", string.format("name=%s", s.shortcutName or ""))
      local task = hs.task.new("/usr/bin/shortcuts", function(exitCode, stdOut, stdErr)
        if not running then return end
        if exitCode ~= 0 then
          logStep(config.enableTimelineLog, cycleCount, "SHORTCUT_ERROR", string.format("code=%d err=%s", exitCode, (stdErr or ""):gsub("\\\\n", " ")))
        else
          logStep(config.enableTimelineLog, cycleCount, "SHORTCUT_SUCCESS", "OK")
        end
        local wait = s.waitAfter or 0.25
        config._timer = hs.timer.doAfter(wait, function()
          config._timer = nil
          if not running then return end
          runStep(s.nextIndex)
        end)
      end, {"run", s.shortcutName or ""})
      task:start()
      return
    else
      logStep(config.enableTimelineLog, cycleCount, "KEY_UNKNOWN", string.format("type=%s key=%s focus=%s", s.type, s.key or "space", frontAppName))
      hs.eventtap.keyStroke({}, s.key or "space", 0)
    end

    local wait = s.waitAfter or 0.25
    config._timer = hs.timer.doAfter(wait, function()
      config._timer = nil
      if not running then return end
      runStep(s.nextIndex)
    end)
  end

  local function start()
    if running then return end
    running = true
    cycleCount = 1
    hs.alert.show(string.format("[%s] 【開始】", config.name), 2)
    logStep(config.enableTimelineLog, cycleCount, "CYCLE_BEGIN", "started (" .. config.name .. ")")
    runStep(1)
  end

  stop = function(reason, saveLog)
    if not running then return end
    running = false
    if config._timer then
      config._timer:stop()
      config._timer = nil
    end
    local alertMsg = "【停止】"
    if reason then alertMsg = alertMsg .. reason end
    hs.alert.show(string.format("[%s] %s", config.name, alertMsg), 2)
    -- saveLogが明示的にfalseでない場合（nilやtrueを含む）にログをアーカイブ保存する
    if saveLog ~= false then
      archiveLog(config.name)
    end
  end

  return {
    config = config,
    start = start,
    stop = stop,
    isRunning = function() return running end
  }
end

local allSequences = {};
`;

  Object.values(state.projects).forEach((p) => {
    lua += `\n-- Project: ${p.name}\n`;
    lua += `local config_${p.id.replace(/-/g, "_")} = {\n`;
    lua += `  name = "${luaString(p.name)}",\n`;
    lua += `  enableTimelineLog = ${p.config.enableTimelineLog || "true"},\n`;
    lua += `  enableAutoStopLog = ${p.config.enableAutoStopLog || "true"},\n`;
    lua += `  enableExecutionAlert = ${p.config.enableExecutionAlert || "false"},\n`;
    lua += `  enableLoop = ${p.config.enableLoop || "true"},\n`;
    lua += `  steps = {\n`;
    
    // UI側の表示順序と完全に一致させるために、ui.js と同じロジックでフラット化
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
      flatIndex: i + 1, // 1-based index for Lua
      displayNum: i + 1
    }));

    /**
     * 指定されたステップの「次」のステップのインデックスを特定する
     */
    const findNextIndex = (step, currentArray, parentAfterIndex) => {
      const idx = currentArray.indexOf(step);
      if (idx < currentArray.length - 1) {
        // 次の兄弟ステップがある場合
        return allSteps.indexOf(currentArray[idx + 1]) + 1;
      }
      // 兄弟がいない場合は親の「次」へ戻る
      return parentAfterIndex;
    };

    /**
     * 各ステップの okIndex, ngIndex, nextIndex を解決する
     */
    const resolveIndices = (steps, afterIndex) => {
      steps.forEach((s) => {
        const flatS = flatSteps[allSteps.indexOf(s)];
        const nextIdx = findNextIndex(s, steps, afterIndex);
        flatS.luaNextIndex = nextIdx;

        if (s.kind === "check") {
          flatS.luaOkIndex = resolveIndices(s.okBranch || [], nextIdx);
          flatS.luaNgIndex = resolveIndices(s.ngBranch || [], nextIdx);
        }
      });
      return steps.length > 0 ? (allSteps.indexOf(steps[0]) + 1) : afterIndex;
    };

    // インデックスの解決を実行
    resolveIndices(p.flowSteps, null);

    // Lua 形式に変換して出力
    flatSteps.forEach((s) => {
      lua += `    {\n`;
      lua += `      displayNum = ${s.displayNum},\n`;
      lua += `      id = ${s.id},\n`;
      lua += `      type = "${s.kind}",\n`;
      lua += `      label = "${luaString(s.title)}",\n`;
      lua += `      waitAfter = ${s.waitAfter ?? 0.25},\n`;
      lua += `      nextIndex = ${s.luaNextIndex || "nil"},\n`;

      if (s.kind === "move") {
        const hk = state.globalSettings[s.moveHotkey] || hotkeys[s.moveHotkey] || { key: "a", mods: ["ctrl", "shift"] };
        lua += `      key = "${luaString(hk.key)}",\n`;
        lua += `      mods = ${modsToLua(hk.mods)},\n`;
      } else if (s.kind === "key") {
        lua += `      key = "${luaString(s.key)}",\n`;
        lua += `      mods = ${modsToLua(s.mods || [])},\n`;
        // アプリ前面化（フォーカス）用のフィールドを出力
        if (s.appName) {
          lua += `      appName = "${luaString(s.appName)}",\n`;
          lua += `      settleBefore = ${s.settleBefore ?? Number(state.globalSettings.settleBeforeKey || 0.2)},\n`;
        }
      } else if (s.kind === "click") {
        lua += `      appName = "${luaString(s.appName)}",\n`;
        lua += `      x = ${s.x},\n`;
        lua += `      y = ${s.y},\n`;
        lua += `      settleBefore = ${s.settleBefore},\n`;
      } else if (s.kind === "focus") {
        lua += `      appName = "${luaString(s.appName)}",\n`;
      } else if (s.kind === "check") {
        lua += `      text = "${luaString(s.text)}",\n`;
        lua += `      useRegex = ${s.useRegex ? "true" : "false"},\n`;
        lua += `      bundleId = "${luaString(s.bundleId || s.appName || "")}",\n`;
        lua += `      okWaitBefore = ${s.okWaitBefore ?? 0.5},\n`;
        lua += `      ngWaitBefore = ${s.ngWaitBefore ?? 0.5},\n`;
        lua += `      okIndex = ${s.luaOkIndex || "nil"},\n`;
        lua += `      ngIndex = ${s.luaNgIndex || "nil"},\n`;
      } else if (s.kind === "jump") {
        lua += `      targetId = ${s.targetId || "nil"},\n`;
      } else if (s.kind === "btt") {
        lua += `      triggerName = "${luaString(s.triggerName)}",\n`;
      } else if (s.kind === "shortcut") {
        lua += `      shortcutName = "${luaString(s.shortcutName)}",\n`;
      }
      lua += `    },\n`;
    });

    lua += `  }\n}\n`;
    lua += `local seq_${p.id.replace(/-/g, "_")} = createSequence(config_${p.id.replace(/-/g, "_")})\n`;
    lua += `table.insert(allSequences, seq_${p.id.replace(/-/g, "_")})\n`;

    if (p.hotkeys.start.key && p.hotkeys.start.key !== "") {
      const sMods = modsToLua(p.hotkeys.start.mods);
      const sKey = luaString(p.hotkeys.start.key);
      lua += `hs.hotkey.bind(${sMods}, "${sKey}", function() seq_${p.id.replace(/-/g, "_")}.start() end)\n`;
    }
    if (p.hotkeys.stop.key && p.hotkeys.stop.key !== "") {
      const tMods = modsToLua(p.hotkeys.stop.mods);
      const tKey = luaString(p.hotkeys.stop.key);
      lua += `hs.hotkey.bind(${tMods}, "${tKey}", function() seq_${p.id.replace(/-/g, "_")}.stop("個別停止") end)\n`;
    }
  });

  lua += `\n-- 全プロジェクト一括停止ホットキー\n`;
  lua += `hs.hotkey.bind(${stopAllModsLua}, "${stopAllKeyLua}", function()\n`;
  lua += `  -- 一括停止時はログを保存しないため、第2引数にfalseを指定する
  for _, s in ipairs(allSequences) do s.stop("一括停止", false) end\n`;
  lua += `end)\n`;

  lua += `\n-- 設定再読込ホットキー\nhs.hotkey.bind(${reloadModsLua}, "${reloadKeyLua}", function()\n  hs.reload()\nend)\n`;
  lua += `hs.alert.show("Hammerspoon LuaScriptBuilder Config Loaded", 2)\n`;

  lua += `
-- ==========================================
-- LuaScriptBuilder 自動連携サーバー (CORS対応)
-- ==========================================
if lsbServer then
  lsbServer:stop()
  lsbServer = nil
end

lsbServer = hs.httpserver.new()
lsbServer:setPort(27312)
lsbServer:setCallback(function(method, path, headers, body)
  if path == "/update" and method == "POST" then
    local initPath = os.getenv("HOME") .. "/.hammerspoon/init.lua"
    local f = io.open(initPath, "w")
    if f then
      f:write(body)
      f:close()
      -- ブラウザにレスポンスを返した後にリロードを走らせるため、少しディレイを置く
      hs.timer.doAfter(0.5, function()
        hs.alert.show("LuaScriptBuilderから直接更新されました！", 3)
        hs.reload()
      end)
      return "OK", 200, {
        ["Access-Control-Allow-Origin"] = "*",
        ["Access-Control-Allow-Methods"] = "POST, OPTIONS",
        ["Access-Control-Allow-Headers"] = "Content-Type"
      }
    else
      return "Failed to open init.lua", 500, {["Access-Control-Allow-Origin"] = "*"}
    end
  elseif method == "OPTIONS" then
    -- CORS プリフライトリクエストに対するレスポンスヘッダーの設定
    return "", 200, {
      ["Access-Control-Allow-Origin"] = "*",
      ["Access-Control-Allow-Methods"] = "POST, OPTIONS",
      ["Access-Control-Allow-Headers"] = "Content-Type"
    }
  end
  return "Not Found", 404, {["Access-Control-Allow-Origin"] = "*"}
end)
lsbServer:start()
`;

  return lua;
}
