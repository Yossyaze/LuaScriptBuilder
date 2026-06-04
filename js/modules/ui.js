import { state } from "./state.js";
import { hotkeys, hotkeyDisplayIds } from "./constants.js";
import { escapeHtml } from "./utils.js";
import { isFirebaseConfigured } from "./firebase.js";
import { hotkeyToDisplay, icons } from "./stepRenderer.js";

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
    logoWrapper.style.width = "20px";
    logoWrapper.style.height = "20px";
    logoWrapper.style.flexShrink = "0";

    if (isLua) {
      logoWrapper.innerHTML = `<svg class="logo-icon lua" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M.38 10.377l-.272-.037c-.048.344-.082.695-.101 1.041l.275.016c.018-.34.051-.682.098-1.02zM4.136 3.289l-.184-.205c-.258.232-.509.48-.746.734l.202.188c.231-.248.476-.49.728-.717zM5.769 2.059l-.146-.235c-.296.186-.586.385-.863.594l.166.219c.27-.203.554-.399.843-.578zM1.824 18.369c.185.297.384.586.593.863l.22-.164c-.205-.271-.399-.555-.58-.844l-.233.145zM1.127 16.402l-.255.104c.129.318.274.635.431.943l.005.01.245-.125-.005-.01c-.153-.301-.295-.611-.421-.922zM.298 9.309l.269.063c.076-.332.168-.664.272-.986l-.261-.087c-.108.332-.202.672-.28 1.01zM.274 12.42l-.275.01c.012.348.04.699.083 1.043l.273-.033c-.042-.336-.069-.68-.081-1.02zM.256 14.506c.073.34.162.682.264 1.014l.263-.08c-.1-.326-.187-.658-.258-.99l-.269.056zM11.573.275L11.563 0c-.348.012-.699.039-1.044.082l.034.273c.338-.041.68-.068 1.02-.08zM23.221 8.566c.1.326.186.66.256.992l.27-.059c-.072-.34-.16-.682-.262-1.014l-.264.081zM17.621 1.389c-.309-.164-.627-.314-.947-.449l-.107.252c.314.133.625.281.926.439l.128-.242zM15.693.572c-.332-.105-.67-.199-1.01-.277l-.063.268c.332.076.664.168.988.273l.085-.264zM6.674 1.545c.298-.15.606-.291.916-.418L7.486.873c-.317.127-.632.272-.937.428l-.015.008.125.244.015-.008zM23.727 11.588l.275-.01a11.797 11.797 0 0 0-.082-1.045l-.273.033c.041.338.068.682.08 1.022zM13.654.105c-.346-.047-.696-.08-1.043-.098l-.014.273c.339.018.683.051 1.019.098l.038-.273zM9.544.527l-.058-.27c-.34.072-.681.16-1.014.264l.081.262c.325-.099.659-.185.991-.256zM1.921 5.469l.231.15c.185-.285.384-.566.592-.834l-.217-.17c-.213.276-.417.563-.606.854zM.943 7.318l.253.107c.132-.313.28-.625.439-.924l-.243-.128c-.163.307-.314.625-.449.945zM18.223 21.943l.145.234c.295-.186.586-.385.863-.594l-.164-.219c-.272.204-.557.4-.844.579zM21.248 19.219l.217.17c.215-.273.418-.561.607-.854l-.23-.148c-.186.285-.385.564-.594.832zM19.855 20.715l.184.203c.258-.23.51-.479.746-.732l-.201-.188c-.23.248-.477.488-.729.717zM22.359 17.504l.244.129c.162-.307.314-.625.449-.945l-.254-.107a11.27 11.27 0 0 1-.439.923zM23.617 13.629l.273.039c.049-.346.082-.695.102-1.043l-.275-.014c-.018.338-.051.682-.1 1.018zM23.156 15.621l.264.086c.107-.332.201-.67.279-1.01l-.268-.063c-.077.333-.169.665-.275.987zM22.453 6.672c.154.303.297.617.424.932l.256-.104c-.131-.322-.277-.643-.436-.953l-.244.125zM8.296 23.418c.331.107.67.201 1.009.279l.062-.268c-.331-.076-.663-.168-.986-.273l-.085.262zM10.335 23.889c.345.049.696.082 1.043.102l.014-.275c-.339-.018-.682-.051-1.019-.098l-.038.271zM17.326 22.449c-.303.154-.613.297-.926.424l.104.256c.318-.131.639-.275.947-.434l.004-.002-.123-.246-.006.002zM4.613 21.467c.274.213.562.418.854.605l.149-.23c-.285-.184-.565-.385-.833-.592l-.17.217zM12.417 23.725l.009.275c.348-.014.699-.041 1.045-.084l-.035-.271c-.336.041-.68.068-1.019.08zM6.37 22.604c.307.162.625.314.946.449l.107-.254c-.313-.133-.624-.279-.924-.439l-.129.244zM3.083 20.041c.233.258.48.51.734.746l.188-.201c-.249-.23-.49-.477-.717-.729l-.205.184zM14.445 23.475l.059.27c.34-.074.68-.162 1.014-.266l-.082-.262c-.325.099-.659.185-.991.258zM21.18.129A2.689 2.689 0 1 0 21.18 5.507 2.689 2.689 0 1 0 21.18.129zM15.324 15.447c0 .471.314.66.852.66.67 0 1.297-.396 1.297-1.016v-.645c-.23.107-.379.141-1.107.24-.735.109-1.042.306-1.042.761zM12 2.818c-5.07 0-9.18 4.109-9.18 9.18 0 5.068 4.11 9.18 9.18 9.18 5.07 0 9.18-4.111 9.18-9.18 0-5.07-4.11-9.18-9.18-9.18zm-2.487 13.77H5.771v-6.023h.769v5.346h2.974v.677zm4.13 0h-.619v-.67c-.405.57-.811.793-1.446.793-.843 0-1.38-.463-1.38-1.182v-3.271h.686v3c0 .52.347.85.893.85.719 0 1.181-.578 1.181-1.461v-2.389h.686v4.33zm-.53-8.393c0-1.484 1.205-2.689 2.689-2.689s2.688 1.205 2.688 2.689-1.203 2.688-2.688 2.688-2.689-1.203-2.689-2.688zm5.567 7.856v.52c-.223.059-.33.074-.471.074-.34 0-.637-.238-.711-.57-.381.406-.918.637-1.471.637-.877 0-1.422-.463-1.422-1.248 0-.527.256-.916.76-1.123.266-.107.414-.141 1.389-.264.545-.066.719-.191.719-.48v-.182c0-.412-.348-.645-.967-.645-.645 0-.957.24-1.016.77h-.693c.041-1 .686-1.404 1.734-1.404 1.066 0 1.627.412 1.627 1.182v2.412c0 .215.133.338.373.338.041-.002.074-.002.149-.017z"/></svg>`;
    } else {
      logoWrapper.innerHTML = `<svg class="logo-icon js" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect width="24" height="24" fill="#000000"/><path d="M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z"/></svg>`;
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
  const cloudOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057" /><path d="M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78" /><path d="m2 2 20 20" /></svg>`;
  
  let cloudSvg = cloudOffSvg;
  let cloudClass = "cloud-off";
  let titleText = "クラウド同期未接続（ログインしてください）";

  if (user) {
    titleText = "クラウド同期済み";
    if (syncStatus === 'syncing') {
      cloudClass = "cloud-syncing";
      titleText = "同期中...";
      cloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`; // ループ矢印
    } else if (syncStatus === 'error') {
      cloudClass = "cloud-error";
      titleText = "同期エラー";
      cloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /><path d="m15 9-6 6M9 9l6 6" /></svg>`; // エラー雲 (ノーマル雲 + 中心のバツ印)
    } else {
      cloudClass = "cloud-ok";
      titleText = "同期完了";
      cloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 15-5.5 5.5L9 18" /><path d="M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327" /></svg>`; // チェック雲
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

