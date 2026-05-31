import { state } from '../js/modules/state.js';
import { generateJavascript } from '../js/modules/javascript.js';

// DOM のモックを設定して例外を防ぐ
global.document = {
  getElementById: (id) => {
    return { checked: true };
  }
};

// テスト用プロジェクトデータを状態(state)にセット
const mockProject = {
  id: "test-proj-id",
  name: "テストJSプロジェクト",
  platform: "js",
  config: {
    enableTimelineLog: "true",
    enableLoop: "true"
  },
  flowSteps: [
    { id: 1, kind: "device_switch", deviceName: "iPad", waitAfter: 1.0 },
    { id: 2, kind: "focus", appName: "Safari", waitAfter: 0.5 },
    { id: 3, kind: "click", appName: "Safari", x: 150, y: 300, settleBefore: 0.3, waitAfter: 0.5 },
    { id: 4, kind: "key", appName: "Safari", key: "enter", mods: ["cmd"], settleBefore: 0.2, waitAfter: 0.5 },
    {
      id: 5,
      kind: "check",
      appName: "Safari",
      bundleId: "com.apple.Safari",
      text: "Success",
      useRegex: false,
      okWaitBefore: 0.5,
      ngWaitBefore: 1.0,
      okBranch: [
        { id: 6, kind: "shortcut", shortcutName: "SuccessHandler", waitAfter: 0.5 }
      ],
      ngBranch: [
        { id: 7, kind: "stop" }
      ]
    }
  ]
};

state.projects = {
  "test-proj-id": mockProject
};
state.activeProjectId = "test-proj-id";
state.flowSteps = mockProject.flowSteps;

console.log("=== JavaScript Code Generation & Deploy Test ===");
try {
  const generatedCode = generateJavascript();
  console.log("Generated Javascript Length:", generatedCode.length);
  
  // 転送サーバーへの送信テストを実行
  const endpoint = "http://127.0.0.1:27312/update-js";
  console.log(`Sending generated code to ${endpoint}...`);
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "X-Project-Name": encodeURIComponent(mockProject.name)
    },
    body: generatedCode
  });
  
  if (response.ok) {
    console.log("Success! JS project updated successfully.");
  } else {
    console.error("Failed to update JS project:", await response.text());
  }
} catch (error) {
  console.error("Error running test:", error);
}
