// apps/mobile/tests/helpers/mobileUiServer.mjs
// Interactive Test UI Dashboard for Daun Sense Mobile AI Agent & Emulator Tests
// Zero dependencies (uses Node.js standard library).
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { checkOllamaServer } from "./ollama.mjs";
import { MobileDriver } from "./mobileDriver.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TESTS_DIR = path.resolve(__dirname, "..");

const TEST_FILES = [
  { id: "audit", file: "agent-mobile-audit.test.mjs", label: "Mobile Emulator & Crash Watchdog Suite" },
  { id: "advanced", file: "agent-mobile-advanced.test.mjs", label: "Advanced QA & CTIP-71 Privacy Invariants" },
  { id: "jira", file: "agent-mobile-jira-traceability.test.mjs", label: "Jira Requirements Traceability Suite" },
  { id: "workflows", file: "agent-mobile-workflows.test.mjs", label: "Workflows, Route Crawl & Auth Profiles" },
];

let activeProcess = null;
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

function runTests(targetFile = null) {
  if (activeProcess) {
    try {
      activeProcess.kill();
    } catch {}
  }

  const files = targetFile
    ? [path.join(TESTS_DIR, targetFile)]
    : TEST_FILES.map((t) => path.join(TESTS_DIR, t.file));

  broadcast("run:start", { target: targetFile || "all", files: files.map((f) => path.basename(f)) });

  const proc = spawn(process.execPath, ["--test", ...files], {
    cwd: path.resolve(TESTS_DIR, ".."),
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  activeProcess = proc;

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    broadcast("log", { type: "stdout", text });
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    broadcast("log", { type: "stderr", text });
  });

  proc.on("close", (code) => {
    activeProcess = null;
    broadcast("run:complete", { exitCode: code });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSE Stream
  if (url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(":\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  // API Status
  if (url.pathname === "/api/status") {
    const driver = new MobileDriver();
    const device = await driver.checkDevice();
    const ollama = await checkOllamaServer();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ device, ollama, testFiles: TEST_FILES }));
    return;
  }

  // API Run
  if (url.pathname === "/api/run") {
    const file = url.searchParams.get("file");
    runTests(file);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // API Stop
  if (url.pathname === "/api/stop") {
    if (activeProcess) {
      activeProcess.kill();
      activeProcess = null;
    }
    broadcast("run:complete", { exitCode: -1, stopped: true });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ stopped: true }));
    return;
  }

  // Serve Main Dashboard HTML
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getDashboardHtml());
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Daun Sense Mobile Test Studio</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: #0d1f15;
      --surface: #15291d;
      --raised: #1c3526;
      --sunken: #0a1810;
      --line: #2e4d38;
      --ink: #eef4e4;
      --ink2: #b4c9ab;
      --ink3: #8ea688;
      --accent: #9bcf6a;
      --accent-press: #86ba56;
      --danger: #f2907b;
      --warning: #e8bd5c;
      --info: #82c8dc;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--line);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand h1 {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.2px;
      color: var(--accent);
    }
    .badges {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .badge {
      background: var(--sunken);
      border: 1px solid var(--line);
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--ink2);
    }
    .badge .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--warning);
    }
    .badge .dot.green { background: var(--accent); }
    .badge .dot.red { background: var(--danger); }
    .controls {
      display: flex;
      gap: 8px;
    }
    button {
      background: var(--accent);
      color: #06110b;
      border: none;
      padding: 7px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    button:hover { background: var(--accent-press); }
    button.secondary {
      background: var(--raised);
      color: var(--ink);
      border: 1px solid var(--line);
    }
    button.secondary:hover { background: var(--line); }
    button.danger {
      background: var(--danger);
      color: #2b0e08;
    }
    main {
      flex: 1;
      display: grid;
      grid-template-columns: 360px 1fr;
      overflow: hidden;
    }
    .sidebar {
      background: var(--surface);
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sidebar-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
      font-weight: 600;
      color: var(--ink2);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .test-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .suite-card {
      background: var(--sunken);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      transition: border-color 0.15s;
    }
    .suite-card:hover { border-color: var(--accent); }
    .suite-card .title {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .suite-card .file {
      font-family: monospace;
      font-size: 11px;
      color: var(--ink3);
      margin-top: 4px;
    }
    .suite-card .actions {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }
    .suite-card button {
      font-size: 11px;
      padding: 4px 8px;
    }
    .console-pane {
      display: flex;
      flex-direction: column;
      background: var(--sunken);
      overflow: hidden;
    }
    .console-header {
      padding: 10px 16px;
      background: var(--surface);
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: var(--ink2);
    }
    .terminal {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 12.5px;
      line-height: 1.55;
      color: #bbf0a0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .terminal .stderr { color: var(--danger); }
    .terminal .dim { color: var(--ink3); }
    .terminal .pass { color: var(--accent); font-weight: bold; }
    .terminal .info { color: var(--info); }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
      <h1>Daun Sense Mobile Test Studio</h1>
    </div>
    <div class="badges">
      <div class="badge" id="adb-badge">
        <span class="dot" id="adb-dot"></span>
        <span id="adb-text">Checking ADB...</span>
      </div>
      <div class="badge" id="ollama-badge">
        <span class="dot" id="ollama-dot"></span>
        <span id="ollama-text">Checking Ollama...</span>
      </div>
    </div>
    <div class="controls">
      <button id="run-all-btn" onclick="runSuite()">
        ▶ Run All Suites
      </button>
      <button class="danger" id="stop-btn" onclick="stopRun()" style="display:none;">
        ■ Stop
      </button>
      <button class="secondary" onclick="clearConsole()">
        Clear
      </button>
    </div>
  </header>

  <main>
    <div class="sidebar">
      <div class="sidebar-header">
        <span>Mobile Test Suites (4)</span>
        <span style="font-size:11px;color:var(--ink3)">21 Tests</span>
      </div>
      <div class="test-list" id="test-list">
        <!-- Rendered via JS -->
      </div>
    </div>
    <div class="console-pane">
      <div class="console-header">
        <span>Execution Terminal Output</span>
        <span id="status-indicator" style="font-size:11px;color:var(--accent)">Ready</span>
      </div>
      <div class="terminal" id="terminal">Welcome to Daun Sense Mobile AI Test Studio.
Click "▶ Run All Suites" or pick a specific suite to start.
</div>
    </div>
  </main>

  <script>
    const term = document.getElementById('terminal');
    const statusInd = document.getElementById('status-indicator');
    const runBtn = document.getElementById('run-all-btn');
    const stopBtn = document.getElementById('stop-btn');

    function appendLog(text, isErr = false) {
      const span = document.createElement('span');
      if (isErr) span.className = 'stderr';
      else if (text.includes('✔') || text.includes('passed')) span.className = 'pass';
      else if (text.includes('ℹ')) span.className = 'info';
      span.textContent = text;
      term.appendChild(span);
      term.scrollTop = term.scrollHeight;
    }

    function clearConsole() {
      term.textContent = '';
    }

    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        // ADB
        const adbDot = document.getElementById('adb-dot');
        const adbText = document.getElementById('adb-text');
        if (data.device.available) {
          adbDot.className = 'dot green';
          adbText.textContent = 'Emulator: ' + data.device.serial;
        } else {
          adbDot.className = 'dot';
          adbText.textContent = 'ADB: Heuristic Mode';
        }

        // Ollama
        const ollamaDot = document.getElementById('ollama-dot');
        const ollamaText = document.getElementById('ollama-text');
        if (data.ollama.online) {
          ollamaDot.className = 'dot green';
          ollamaText.textContent = 'Ollama: Online (' + (data.ollama.models[0] || 'active') + ')';
        } else {
          ollamaDot.className = 'dot';
          ollamaText.textContent = 'Ollama: Offline (Heuristics)';
        }

        // Render test list
        const list = document.getElementById('test-list');
        list.innerHTML = '';
        data.testFiles.forEach(tf => {
          const div = document.createElement('div');
          div.className = 'suite-card';
          div.innerHTML = \`
            <div class="title">
              <span>\${tf.label}</span>
            </div>
            <div class="file">\${tf.file}</div>
            <div class="actions">
              <button class="secondary" onclick="runSuite('\${tf.file}')">▶ Run Suite</button>
            </div>
          \`;
          list.appendChild(div);
        });
      } catch (e) {
        console.error(e);
      }
    }

    function runSuite(file = '') {
      clearConsole();
      statusInd.textContent = 'Running tests...';
      statusInd.style.color = 'var(--warning)';
      runBtn.style.display = 'none';
      stopBtn.style.display = 'inline-flex';
      fetch('/api/run' + (file ? '?file=' + encodeURIComponent(file) : ''));
    }

    function stopRun() {
      fetch('/api/stop');
    }

    // SSE connection
    const evtSource = new EventSource('/events');
    evtSource.addEventListener('log', e => {
      const data = JSON.parse(e.data);
      appendLog(data.text, data.type === 'stderr');
    });

    evtSource.addEventListener('run:start', e => {
      const data = JSON.parse(e.data);
      appendLog('=== Test Run Started: ' + data.target + ' ===\\n');
    });

    evtSource.addEventListener('run:complete', e => {
      const data = JSON.parse(e.data);
      statusInd.textContent = data.stopped ? 'Stopped' : (data.exitCode === 0 ? 'Passed (All Green)' : 'Failed');
      statusInd.style.color = data.exitCode === 0 ? 'var(--accent)' : 'var(--danger)';
      runBtn.style.display = 'inline-flex';
      stopBtn.style.display = 'none';
      appendLog('\\n=== Run Complete (Exit Code: ' + data.exitCode + ') ===\\n');
    });

    checkStatus();
  </script>
</body>
</html>`;
}

// Start Server
const PORT = process.env.PORT || 5252;
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n======================================================`);
  console.log(`  📱 DAUN SENSE MOBILE TEST STUDIO (UI MODE)`);
  console.log(`  Studio running at: ${url}`);
  console.log(`======================================================\n`);

  // Auto-launch browser if not disabled
  if (process.env.NO_OPEN !== "1") {
    const cmd =
      process.platform === "win32"
        ? `start ${url}`
        : process.platform === "darwin"
        ? `open ${url}`
        : `xdg-open ${url}`;
    try {
      spawn(cmd, { shell: true, stdio: "ignore" });
    } catch {}
  }
});
