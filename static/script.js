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
  const chatInfo = $("#chatInfo");

  function setInfo(text, type = "info") {
    chatInfo.textContent = text;
    chatInfo.style.color =
      type === "ok" ? "var(--ok)" :
      type === "err" ? "var(--danger)" :
      "var(--muted)";
  }

  function loadHistory() {
    const raw = localStorage.getItem("tusty_chat_history");
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveHistory(items) {
    localStorage.setItem("tusty_chat_history", JSON.stringify(items.slice(-50)));
  }

  function scrollToBottom() {
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function renderMessage(m) {
    const isBot = m.role === "bot";
    const content = isBot
      ? marked.parse(m.text)                  // markdown -> HTML
      : `<div>${escapeHTML(m.text)}</div>`;   // user stays plain text (safe)

    return `
      <div class="msg ${m.role}">
        ${content}
        <div class="msgMeta">${escapeHTML(m.time || "")}</div>
      </div>
    `;
  }

  function renderHistory() {
    const items = loadHistory();
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
    const items = loadHistory();
    items.push({ role, text, time: nowTime() });
    saveHistory(items);
    renderHistory();
  }

  function setTextareaHeight(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  questionInput.addEventListener("input", () => setTextareaHeight(questionInput));

  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  btnNewChat.addEventListener("click", () => {
    localStorage.removeItem("tusty_chat_history");
    renderHistory();
    setInfo("New chat started", "ok");
  });

  async function send() {
    const question = questionInput.value.trim();
    if (!question) return;

    questionInput.value = "";
    setTextareaHeight(questionInput);

    addMessage("user", question);
    setInfo("Thinking…", "info");

    // show temporary bot message
    const tempId = "temp_" + Date.now();
    const items = loadHistory();
    items.push({ role: "bot", text: "Thinking…", time: nowTime(), id: tempId });
    saveHistory(items);
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

      // replace temp message
      const updated = loadHistory().map((m) => {
        if (m.id === tempId) return { role: "bot", text: answer, time: nowTime() };
        return m;
      });
      saveHistory(updated);
      renderHistory();
      setInfo("Ready", "ok");
    } catch (err) {
      const updated = loadHistory().map((m) => {
        if (m.id === tempId) return { role: "bot", text: `Error: ${err.message || err}`, time: nowTime() };
        return m;
      });
      saveHistory(updated);
      renderHistory();
      setInfo("Error", "err");
    }
  }

  btnSend.addEventListener("click", send);

  renderHistory();
  setInfo("Ready", "ok");
}

/* ========= Boot ========= */
if (page === "admin") initAdmin();
if (page === "chat") initChat();