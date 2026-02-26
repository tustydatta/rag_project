/* ========= Small helpers ========= */
const $ = (sel) => document.querySelector(sel);
const page = document.body?.dataset?.page;

function nowTime() {
  const d = new Date();
  return d.toLocaleString();
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* ========= Theme toggle (shared) ========= */
(function initTheme() {
  const saved = localStorage.getItem("tusty_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);

  const btn = $("#btnTheme");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tusty_theme", next);
  });
})();

//console.log(Date.now());

/* ========= Admin page ========= */
function initAdmin() {
  const fileInput = $("#fileInput");
  const dropzone = $("#dropzone");
  const btnUpload = $("#btnUpload");
  const btnClear = $("#btnClear");
  const statusText = $("#statusText");
  const progressBar = $("#progressBar");
  const recentList = $("#recentList");
  const btnClearRecent = $("#btnClearRecent");

  let selectedFile = null;

  function setStatus(msg, type = "info") {
    statusText.textContent = msg;

    // quick semantic color
    statusText.style.color =
      type === "ok" ? "var(--ok)" :
      type === "err" ? "var(--danger)" :
      "var(--muted)";
  }

  function setProgress(pct) {
    progressBar.style.width = `${pct}%`;
  }

  function loadRecent() {
    const items = JSON.parse(localStorage.getItem("tusty_recent_uploads") || "[]");
    return Array.isArray(items) ? items : [];
  }

  function saveRecent(items) {
    localStorage.setItem("tusty_recent_uploads", JSON.stringify(items.slice(0, 12)));
  }

  function renderRecent() {
    const items = loadRecent();
    if (!items.length) {
      recentList.innerHTML = `<div class="muted">No uploads yet.</div>`;
      return;
    }

    recentList.innerHTML = items.map((it) => {
      return `
        <div class="listItem">
          <div>
            <div class="listTitle">${escapeHTML(it.name)}</div>
            <div class="listMeta">${escapeHTML(it.time)} • ${escapeHTML(it.size)}</div>
          </div>
          <div class="pill">${escapeHTML(it.status)}</div>
        </div>
      `;
    }).join("");
  }

  function humanSize(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function updateSelectedFile(file) {
    selectedFile = file || null;
    if (!selectedFile) {
      setStatus("No file selected.");
      return;
    }
    setStatus(`Selected: ${selectedFile.name} (${humanSize(selectedFile.size)})`, "info");
  }

  // Click-to-select
  fileInput.addEventListener("change", () => {
    updateSelectedFile(fileInput.files?.[0]);
  });

  // Drag & drop
  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    fileInput.files = e.dataTransfer.files;
    updateSelectedFile(file);
  });

  btnClear.addEventListener("click", () => {
    fileInput.value = "";
    updateSelectedFile(null);
    setProgress(0);
  });

  btnClearRecent?.addEventListener("click", () => {
    localStorage.removeItem("tusty_recent_uploads");
    renderRecent();
  });

  async function upload() {
    if (!selectedFile) {
      setStatus("Please select a file first.", "err");
      return;
    }

    setProgress(15);
    setStatus("Uploading…", "info");

    const form = new FormData();
    form.append("file", selectedFile);

    try {
      const res = await fetch("/upload", { method: "POST", body: form });
      setProgress(70);

      if (!res.ok) {
        let text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setProgress(100);
      setStatus(data.message || "Uploaded successfully", "ok");

      const items = loadRecent();
      items.unshift({
        name: selectedFile.name,
        size: humanSize(selectedFile.size),
        time: nowTime(),
        status: "Success"
      });
      saveRecent(items);
      renderRecent();

      // reset
      fileInput.value = "";
      selectedFile = null;
      setTimeout(() => setProgress(0), 600);
    } catch (err) {
      setProgress(0);
      setStatus(`Upload error: ${err.message || err}`, "err");

      const items = loadRecent();
      items.unshift({
        name: selectedFile.name,
        size: humanSize(selectedFile.size),
        time: nowTime(),
        status: "Failed"
      });
      saveRecent(items);
      renderRecent();
    }
  }

  btnUpload.addEventListener("click", upload);

  renderRecent();
}

/* ========= Chat page ========= */
function initChat() {
  const chatBody = $("#chatBody");
  const questionInput = $("#questionInput");
  const btnSend = $("#btnSend");
  const btnNewChat = $("#btnNewChat");
  const btnNewChatSide = $("#btnNewChatSide");
  const chatInfo = $("#chatInfo");
  const chatList = $("#chatList");

  const CHATS_KEY = "tusty_chats";
  const CURRENT_KEY = "tusty_current_chat"


  function setInfo(text, type = "info") {
    chatInfo.textContent = text;
    chatInfo.style.color =
      type === "ok" ? "var(--ok)" :
      type === "err" ? "var(--danger)" :
      "var(--muted)";
  }

  function uid() {
    return "c_" + Math.random().toString(16).slice(2) + "_" + Date.now();
  }

  function loadChats() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveChats(chats) {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(-50)));
  }

  function getCurrentChatId() {
    return localStorage.getItem(CURRENT_KEY) || "";
  }

  function setCurrentChatId(id) {
    localStorage.setItem(CURRENT_KEY, id);
  }

  function getChatById(chats, id) {
    return chats.find(c => c.id === id);
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "";
    }
  }

  // --- migration: old single history -> one chat session ---
  function migrateOldHistoryIfNeeded() {
    const chats = loadChats();
    if (chats.length) return;

    const rawOld = localStorage.getItem("tusty_chat_history");
    if (!rawOld) return;

    let oldMsgs = [];
    try {
      oldMsgs = JSON.parse(rawOld || "[]");
    } catch {
      oldMsgs = [];
    }
    if (!Array.isArray(oldMsgs) || !oldMsgs.length) return;

    const id = uid();
    const createdAt = Date.now();
    const firstUser = oldMsgs.find(m => m && m.role === "user" && m.text)?.text || "Previous chat";

    const migrated = [{
      id,
      title: makeTitle(firstUser),
      createdAt,
      updatedAt: createdAt,
      messages: oldMsgs.map(m => ({
        role: m.role,
        text: m.text,
        time: m.time || "",
        id: m.id || undefined
      }))
    }];

    saveChats(migrated);
    setCurrentChatId(id);
    localStorage.removeItem("tusty_chat_history");
  }

  function makeTitle(text) {
    const t = String(text || "").trim().replace(/\s+/g, " ");
    if (!t) return "New chat";
    return t.length > 28 ? t.slice(0, 28) + "…" : t;
  }

  function ensureCurrentChat() {
    let chats = loadChats();
    let currentId = getCurrentChatId();

    let current = getChatById(chats, currentId);
    if (!current) {
      const id = uid();
      const now = Date.now();
      current = { id, title: "New chat", createdAt: now, updatedAt: now, messages: [] };
      chats.unshift(current);
      saveChats(chats);
      setCurrentChatId(id);
    }
    return current;
  }

  function updateChat(chatUpdater) {
    const chats = loadChats();
    const id = getCurrentChatId();
    const idx = chats.findIndex(c => c.id === id);
    if (idx === -1) return;

    const updated = chatUpdater({ ...chats[idx] });
    chats[idx] = updated;

    // keep most recent at top
    chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    saveChats(chats);
  }

  function renderChatList() {
    const chats = loadChats().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const currentId = getCurrentChatId();

    if (!chatList) return;

    if (!chats.length) {
      chatList.innerHTML = `<div class="muted">No chats yet.</div>`;
      return;
    }

    chatList.innerHTML = chats.map(c => {
      const active = c.id === currentId ? "active" : "";
      return `
        <div class="chatItem ${active}" data-id="${escapeHTML(c.id)}">
          <div class="chatItemTitle">${escapeHTML(c.title || "New chat")}</div>
          <div class="chatItemMeta">${escapeHTML(formatTime(c.updatedAt || c.createdAt || ""))}</div>
        </div>
      `;
    }).join("");

    // click handlers
    chatList.querySelectorAll(".chatItem").forEach(el => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-id");
        if (!id) return;
        setCurrentChatId(id);
        renderChatList();
        renderHistory();
      });
    });
  }

  function scrollToBottom() {
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function renderMessage(m) {
    const isBot = m.role === "bot";
    const content = isBot
      ? marked.parse(m.text)
      : `<div>${escapeHTML(m.text)}</div>`;

    return `
      <div class="msg ${m.role}">
        ${content}
        <div class="msgMeta">${escapeHTML(m.time || "")}</div>
      </div>
    `;
  }

  function getCurrentMessages() {
    const chats = loadChats();
    const currentId = getCurrentChatId();
    const c = getChatById(chats, currentId);
    return c?.messages || [];
  }

  function renderHistory() {
    const items = getCurrentMessages();

    if (!items.length) {
      chatBody.innerHTML = `
        <div class="msg bot">
          Hi! Upload documents from <b>Admin</b>, then ask me anything about them.
          <div class="msgMeta">${escapeHTML(nowTime())}</div>
        </div>
      `;
      return;
    }

    chatBody.innerHTML = items.map(renderMessage).join("");
    scrollToBottom();
  }

  function addMessage(role, text) {
    const time = nowTime();
    updateChat((chat) => {
      const now = Date.now();
      const msg = { role, text, time };

      chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
      chat.messages.push(msg);
      chat.updatedAt = now;

      // Set title from first user message if still default
      if (role === "user" && (!chat.title || chat.title === "New chat")) {
        chat.title = makeTitle(text);
      }

      return chat;
    });

    renderChatList();
    renderHistory();
  }

  function setTextareaHeight(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }


  function newChat() {
    const chats = loadChats();
    const id = uid();
    const now = Date.now();
    const chat = { id, title: "New chat", createdAt: now, updatedAt: now, messages: [] };
    chats.unshift(chat);
    saveChats(chats);
    setCurrentChatId(id);

    renderChatList();
    renderHistory();
    setInfo("New chat started", "ok");
  }

  questionInput.addEventListener("input", () => setTextareaHeight(questionInput));

  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  btnNewChat?.addEventListener("click", newChat);
  btnNewChatSide?.addEventListener("click", newChat);

  async function send() {
    const question = questionInput.value.trim();
    if (!question) return;

    questionInput.value = "";
    setTextareaHeight(questionInput);

    addMessage("user", question);
    setInfo("Thinking…", "info");

    // temp bot message (with id) so we can replace it
    const tempId = "temp_" + Date.now();

    updateChat((chat) => {
      chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
      chat.messages.push({ role: "bot", text: "Thinking…", time: nowTime(), id: tempId });
      chat.updatedAt = Date.now();
      return chat;
    });

    renderChatList();
    renderHistory();

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      if (!res.ok) {
        let txt = await res.text();
        throw new Error(txt || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const answer = (data && data.answer) ? String(data.answer) : "No answer returned.";

      updateChat((chat) => {
        chat.messages = (chat.messages || []).map((m) => {
          if (m.id === tempId) return { role: "bot", text: answer, time: nowTime() };
          return m;
        });
        chat.updatedAt = Date.now();
        return chat;
      });

      renderChatList();
      renderHistory();
      setInfo("Ready", "ok");
    } catch (err) {
      updateChat((chat) => {
        chat.messages = (chat.messages || []).map((m) => {
          if (m.id === tempId) return { role: "bot", text: `Error: ${err.message || err}`, time: nowTime() };
          return m;
        });
        chat.updatedAt = Date.now();
        return chat;
      });

      renderChatList();
      renderHistory();
      setInfo("Error", "err");
    }
  }

  btnSend.addEventListener("click", send);

  // boot
  migrateOldHistoryIfNeeded();
  ensureCurrentChat();
  renderChatList();
  renderHistory();
  setInfo("Ready", "ok");
 
}

/* ========= Boot ========= */
if (page === "admin") initAdmin();
if (page === "chat") initChat();