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

local function logStep(enableTimelineLog, cycleCount, step, detail)
  if not enableTimelineLog then return end
  local msg = string.format("%s | cycle=%d | %s", nowTimestamp(), cycleCount, step)
  if detail and detail ~= "" then
    msg = msg .. " | " .. detail
  end
  print(msg)
end

local function showAlert(config, message)
  if not config.enableExecutionAlert then return end
  hs.alert.show(message, 1)
end

local function createSequence(config)
  local running = false
  local cycleCount = 0

  local stepIdToIndex = {}
  local labelToIndex = {}
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
      local qPattern = "'" .. pattern:gsub("'", "'\\''") .. "'"
      local qTmp = "'" .. tmp:gsub("'", "'\\''") .. "'"
      -- -oE でマッチした箇所を抽出（-qは外す）
      local output, status = hs.execute(string.format("/usr/bin/grep -oE %s %s", qPattern, qTmp))
      os.remove(tmp)
      if status then
        return true, (output or ""):gsub("\\n", " "):sub(1, 100)
      end
    end
    return false, nil
  end

  -- ブランチ内のステップを逐次実行するヘルパー
  local executeBranch
  local function executeSingleStep(bStep, bIndex, onDone)
    if not running then return end
    local stepLabel = string.format("STEP=%s BRANCH index=%d", bStep.displayNum or "?", bIndex)
    logStep(config.enableTimelineLog, cycleCount, stepLabel, string.format("type=%s label=%s", bStep.type, bStep.label))
    showAlert(config, string.format("[%s] Step %d: %s", config.name, bStep.displayNum or 0, bStep.label))
    if bStep.type == "stop" then
      running = false
      hs.alert.show(string.format("[%s] 【停止】ブランチ内STOP", config.name), 5)
      return
    elseif bStep.type == "jump" then
      local nextIdx = nil
      if bStep.targetId then nextIdx = stepIdToIndex[bStep.targetId] end
      local wait = bStep.waitAfter or 0.25
      config._timer = hs.timer.doAfter(wait, function()
        config._timer = nil
        if not running then return end
        if nextIdx then
          logStep(config.enableTimelineLog, cycleCount, "BRANCH_JUMP", "to index=" .. nextIdx)
          -- ブランチを中断してメインフローの指定位置へ
          onDone(nextIdx)
        else
          onDone(nil)
        end
      end)
      return
    elseif bStep.type == "check" then
      local task = hs.task.new("/usr/bin/shortcuts", function(exitCode, stdOut, stdErr)
        if not running then return end

        local matched = false
        local matchedText = nil
        if exitCode == 0 and stdOut then
          if bStep.useRegex then
            matched, matchedText = checkRegexMatch(stdOut, bStep.text)
          else
            local start, finish = string.find(stdOut, bStep.text, 1, true)
            if start then
              matched = true
              matchedText = string.sub(stdOut, start, finish)
            end
          end
        end

        local cleanOut = (stdOut or ""):gsub("\\n", " "):sub(1, 200)
        local logDetail = string.format("pattern=%s | screen=%s", bStep.text, cleanOut)
        if matched then
          logDetail = logDetail .. string.format(" | matched=%s", matchedText or "")
          logStep(config.enableTimelineLog, cycleCount, "CHECK_MATCH", logDetail)
          branch = bStep.okBranch or {}
          waitBefore = bStep.okWaitBefore or 0.5
        else
          logStep(config.enableTimelineLog, cycleCount, "CHECK_NO_MATCH", logDetail)
          branch = bStep.ngBranch or {}
          waitBefore = bStep.ngWaitBefore or 0.5
        end
        logStep(config.enableTimelineLog, cycleCount, "BRANCH_WAIT_START", string.format("%.2fs", waitBefore))
        config._timer = hs.timer.doAfter(waitBefore, function()
          config._timer = nil
          executeBranch(branch, function(jumpIdx)
            onDone(jumpIdx)
          end)
        end)
      end, {"run", "GetScreenText"})
      task:start()
      return
    elseif bStep.type == "move" then
      hs.eventtap.keyStroke(bStep.mods or {}, bStep.key, 0)
    elseif bStep.type == "click" then
      local app = hs.application.find(bStep.appName)
      if not app then hs.application.launchOrFocus(bStep.appName) end
      -- クリックは簡易実装（ブランチ内）
      config._timer = hs.timer.doAfter(bStep.settleBefore or 0.5, function()
        if not running then return end
        local ca = hs.application.find(bStep.appName)
        if ca then
          ca:activate()
          local win = ca:mainWindow()
          if win then
            local f = win:frame()
            local orig = hs.mouse.absolutePosition()
            hs.eventtap.leftClick({x = f.x + bStep.x, y = f.y + bStep.y})
            hs.timer.usleep(10000)
            hs.mouse.absolutePosition(orig)
          end
        end
        local wait = bStep.waitAfter or 0.25
        config._timer = hs.timer.doAfter(wait, function() config._timer = nil; onDone(nil) end)
      end)
      return
    elseif bStep.type == "focus" then
      hs.application.launchOrFocus(bStep.appName)
    else
      hs.eventtap.keyStroke({}, bStep.key or "space", 0)
    end
    -- 待機後に次のステップへ
    local wait = bStep.waitAfter or 0.25
    config._timer = hs.timer.doAfter(wait, function()
      config._timer = nil
      if not running then return end
      onDone(nil)
    end)
  end

  executeBranch = function(branchSteps, onAllDone)
    if #branchSteps == 0 then
      onAllDone(nil)
      return
    end
    local function runNext(bi)
      if not running then return end
      if bi > #branchSteps then
        onAllDone(nil)
        return
      end
      executeSingleStep(branchSteps[bi], bi, function(jumpIdx)
        if jumpIdx then
          -- ブランチ内のJUMPがメインフローへのジャンプを指示
          onAllDone(jumpIdx)
        else
          runNext(bi + 1)
        end
      end)
    end
    runNext(1)
  end

  local function runCycle()
    if not running then
      logStep(config.enableTimelineLog, cycleCount, "STOP_DETECTED", "cycle entry")
      return
    end

    cycleCount = cycleCount + 1
    logStep(config.enableTimelineLog, cycleCount, "CYCLE_BEGIN", "started (" .. config.name .. ")")

    local function runStep(index)
      if not running then return end
      if index > #config.steps then
        logStep(config.enableTimelineLog, cycleCount, "CYCLE_END", "completed")
        if config.enableLoop then
          runCycle()
        else
          running = false
          hs.alert.show(string.format("[%s] 【完了】全ステップ終了", config.name), 2)
        end
        return
      end

      local s = config.steps[index]
      local stepLabel = string.format("STEP=%s index=%d", s.displayNum or "?", index)
      logStep(config.enableTimelineLog, cycleCount, stepLabel, string.format("type=%s label=%s", s.type, s.label))
      showAlert(config, string.format("[%s] Step %d: %s", config.name, s.displayNum or index, s.label))

      if s.type == "move" then
        hs.eventtap.keyStroke(s.mods or {}, s.key, 0)
      elseif s.type == "key" then
        hs.eventtap.keyStroke({}, s.key, 0)
      elseif s.type == "click" then
        local app = hs.application.find(s.appName)
        if not app then hs.application.launchOrFocus(s.appName) end
        config._timer = hs.timer.doAfter(s.settleBefore or 0.5, function()
          if not running then return end
          local ca = hs.application.find(s.appName)
          if ca then
            ca:activate()
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
          config._timer = hs.timer.doAfter(wait, function() config._timer = nil; runStep(index + 1) end)
        end)
        return
      elseif s.type == "focus" then
        hs.application.launchOrFocus(s.appName)
      elseif s.type == "stop" then
        running = false
        hs.alert.show(string.format("[%s] 【停止】ステップ内STOP", config.name), 5)
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
            runStep(index + 1)
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

          local cleanOut = (stdOut or ""):gsub("\\n", " "):sub(1, 200)
          local logDetail = string.format("pattern=%s | screen=%s", s.text, cleanOut)
          if matched then
            logDetail = logDetail .. string.format(" | matched=%s", matchedText or "")
            logStep(config.enableTimelineLog, cycleCount, "CHECK_MATCH", logDetail)
            branch = s.okBranch or {}
            waitBefore = s.okWaitBefore or 0.5
          else
            logStep(config.enableTimelineLog, cycleCount, "CHECK_NO_MATCH", logDetail)
            branch = s.ngBranch or {}
            waitBefore = s.ngWaitBefore or 0.5
          end
          logStep(config.enableTimelineLog, cycleCount, "BRANCH_WAIT_START", string.format("%.2fs", waitBefore))
          config._timer = hs.timer.doAfter(waitBefore, function()
            config._timer = nil
            executeBranch(branch, function(jumpIdx)
              if jumpIdx then
                runStep(jumpIdx)
              else
                runStep(index + 1)
              end
            end)
          end)
        end, {"run", "GetScreenText"})
        task:start()
        return
      end

      local wait = s.waitAfter or 0.25
      config._timer = hs.timer.doAfter(wait, function()
        config._timer = nil
        runStep(index + 1)
      end)
    end

    runStep(1)
  end

  local function start()
    if running then return end
    running = true
    cycleCount = 0
    hs.alert.show(string.format("[%s] 【開始】", config.name), 2)
    runCycle()
  end

  local function stop()
    if not running then return end
    running = false
    if config._timer then
      config._timer:stop()
      config._timer = nil
    end
    hs.alert.show(string.format("[%s] 【停止】", config.name), 2)
  end

  return {
    config = config,
    start = start,
    stop = stop,
    isRunning = function() return running end
  }
end

local allSequences = {}
`;

  Object.values(state.projects).forEach((p) => {
    lua += `\n-- Project: ${p.name}\n`;
    lua += `local config_${p.id.replace(/-/g, "_")} = {\n`;
    lua += `  name = "${luaString(p.name)}",\n`;
    lua += `  enableTimelineLog = ${p.config.enableTimelineLog || "true"},\n`;
    lua += `  enableExecutionAlert = ${p.config.enableExecutionAlert || "false"},\n`;
    lua += `  enableLoop = ${p.config.enableLoop || "true"},\n`;
    lua += `  steps = {\n`;
    
    let currentDisplayNum = 1;

    const walkSteps = (steps) => {
      let sLua = "";
      steps.forEach((s) => {
        const displayNum = currentDisplayNum++;
        sLua += `    {\n`;
        sLua += `      displayNum = ${displayNum},\n`;
        sLua += `      id = ${s.id},\n`;
        sLua += `      type = "${s.kind}",\n`;
        sLua += `      label = "${luaString(s.title)}",\n`;
        sLua += `      waitAfter = ${s.waitAfter ?? 0.25},\n`;
        if (s.kind === "move") {
          const hk = state.globalSettings[s.moveHotkey] || hotkeys[s.moveHotkey] || { key: "a", mods: ["ctrl", "shift"] };

          sLua += `      key = "${luaString(hk.key)}",\n`;
          sLua += `      mods = ${modsToLua(hk.mods)},\n`;
        } else if (s.kind === "key") {
          sLua += `      key = "${luaString(s.key)}",\n`;
        } else if (s.kind === "click") {
          sLua += `      appName = "${luaString(s.appName)}",\n`;
          sLua += `      x = ${s.x},\n`;
          sLua += `      y = ${s.y},\n`;
          sLua += `      settleBefore = ${s.settleBefore},\n`;
        } else if (s.kind === "focus") {
          sLua += `      appName = "${luaString(s.appName)}",\n`;
        } else if (s.kind === "check") {
          sLua += `      text = "${luaString(s.text)}",\n`;
          sLua += `      useRegex = ${s.useRegex ? "true" : "false"},\n`;
          sLua += `      okWaitBefore = ${s.okWaitBefore ?? 0.5},\n`;
          sLua += `      ngWaitBefore = ${s.ngWaitBefore ?? 0.5},\n`;
          sLua += `      okBranch = {\n${walkSteps(s.okBranch || [])}      },\n`;
          sLua += `      ngBranch = {\n${walkSteps(s.ngBranch || [])}      },\n`;
        } else if (s.kind === "jump") {
          sLua += `      targetId = ${s.targetId || "nil"},\n`;
        }
        sLua += `    },\n`;
      });
      return sLua;
    };

    lua += walkSteps(p.flowSteps);
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
      lua += `hs.hotkey.bind(${tMods}, "${tKey}", function() seq_${p.id.replace(/-/g, "_")}.stop() end)\n`;
    }
  });

  lua += `\n-- 全プロジェクト一括停止ホットキー\n`;
  lua += `hs.hotkey.bind(${stopAllModsLua}, "${stopAllKeyLua}", function()\n`;
  lua += `  for _, s in ipairs(allSequences) do s.stop() end\n`;
  lua += `end)\n`;

  lua += `\n-- 設定再読込ホットキー\nhs.hotkey.bind(${reloadModsLua}, "${reloadKeyLua}", function()\n  hs.reload()\nend)\n`;
  lua += `hs.alert.show("Hammerspoon LuaScriptBuilder Config Loaded", 2)\n`;

  return lua;
}
