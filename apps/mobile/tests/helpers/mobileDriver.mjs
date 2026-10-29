// apps/mobile/tests/helpers/mobileDriver.js
// Automated Android Emulator & UIAutomator Driver for Daun Sense Mobile
// Controls emulator screen, touch events, and view hierarchy via ADB.
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import config from "../../mobile.config.mjs";

/**
 * Locate the adb executable on the system.
 */
export function findAdbBinary() {
  // 1. Check if adb is on PATH
  try {
    const checkCmd = process.platform === "win32" ? "where adb" : "which adb";
    const found = execFileSync(process.platform === "win32" ? "cmd.exe" : "sh", [
      process.platform === "win32" ? "/c" : "-c",
      checkCmd,
    ], { stdio: ["pipe", "pipe", "ignore"], encoding: "utf8" }).trim();
    if (found && fs.existsSync(found.split("\r\n")[0])) {
      return found.split("\r\n")[0];
    }
  } catch {
    // Continue searching known standard directories
  }

  // 2. Check standard Android SDK locations
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe"),
    path.join(process.env.ANDROID_HOME || "", "platform-tools", process.platform === "win32" ? "adb.exe" : "adb"),
    path.join(process.env.ANDROID_SDK_ROOT || "", "platform-tools", process.platform === "win32" ? "adb.exe" : "adb"),
    path.join(process.env.PROGRAMFILES || "", "Android", "platform-tools", "adb.exe"),
    "C:\\Android\\platform-tools\\adb.exe",
    "/usr/bin/adb",
    "/usr/local/bin/adb",
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "adb"; // Fall back to adb command name
}

const ADB = findAdbBinary();

/**
 * Execute an adb command returning stdout as a string or buffer.
 */
export function execAdb(args, { binary = false, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      ADB,
      args,
      {
        encoding: binary ? "buffer" : "utf8",
        maxBuffer: 30 * 1024 * 1024, // 30 MB
        timeout,
      },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`ADB execution failed: ${err.message}. Stderr: ${stderr}`));
        }
        resolve(stdout);
      }
    );
  });
}

/**
 * Driver class for managing the Android Emulator and interacting with Daun Sense.
 */
export class MobileDriver {
  constructor(options = {}) {
    this.targetDeviceId = options.targetDeviceId || config.emulator.targetDeviceId;
    this.packageName = options.packageName || config.emulator.packageName;
    this.mainActivity = options.mainActivity || config.emulator.mainActivity;
    this.activeDevice = null;
  }

  /**
   * Check connected devices or running emulators.
   */
  async checkDevice() {
    try {
      const output = await execAdb(["devices", "-l"]);
      const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);
      const devices = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("device") && !line.includes("offline") && !line.includes("unauthorized")) {
          const parts = line.split(/\s+/);
          const serial = parts[0];
          const isEmulator = serial.startsWith("emulator-");
          devices.push({ serial, isEmulator, info: line });
        }
      }

      if (devices.length === 0) {
        return {
          available: false,
          reason: "No running Android emulator or active ADB device detected.",
          devices: [],
        };
      }

      // Select target device or the first emulator/device
      const selected = this.targetDeviceId
        ? devices.find((d) => d.serial === this.targetDeviceId) || devices[0]
        : devices.find((d) => d.isEmulator) || devices[0];

      this.activeDevice = selected.serial;

      return {
        available: true,
        serial: selected.serial,
        isEmulator: selected.isEmulator,
        devices,
      };
    } catch (err) {
      return {
        available: false,
        reason: `Failed to invoke ADB: ${err.message}`,
        devices: [],
      };
    }
  }

  /**
   * Helper to format adb arguments targeting the active device.
   */
  _args(subArgs) {
    if (this.activeDevice) {
      return ["-s", this.activeDevice, ...subArgs];
    }
    return subArgs;
  }

  /**
   * Take a real PNG screenshot of the emulator.
   */
  async takeScreenshot() {
    const rawBuffer = await execAdb(this._args(["exec-out", "screencap", "-p"]), { binary: true });
    return rawBuffer;
  }

  /**
   * Dump the Android UI hierarchy using UIAutomator.
   */
  async dumpHierarchy() {
    try {
      // Direct dump to stdout
      const xml = await execAdb(this._args(["exec-out", "uiautomator", "dump", "/dev/tty"]), {
        timeout: 10000,
      });
      if (xml && xml.includes("<hierarchy")) {
        return xml;
      }
    } catch {
      // Fallback via sdcard file dump
    }

    await execAdb(this._args(["shell", "uiautomator", "dump", "/sdcard/window_dump.xml"]));
    const xml = await execAdb(this._args(["shell", "cat", "/sdcard/window_dump.xml"]));
    return xml;
  }

  /**
   * Parse the UIAutomator XML hierarchy into structured node objects.
   */
  parseHierarchy(xml) {
    const nodes = [];
    if (!xml) return nodes;

    const regex = /<node\s+([^>]+)>/g;
    let match;

    while ((match = regex.exec(xml)) !== null) {
      const attrsStr = match[1];
      const getAttr = (name) => {
        const m = attrsStr.match(new RegExp(`${name}="([^"]*)"`));
        return m ? m[1] : "";
      };

      const text = getAttr("text");
      const contentDesc = getAttr("content-desc");
      const className = getAttr("class");
      const resourceId = getAttr("resource-id");
      const boundsStr = getAttr("bounds"); // e.g. "[0,0][1080,2400]"
      const clickable = getAttr("clickable") === "true";

      let bounds = null;
      let center = null;
      if (boundsStr) {
        const bMatch = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
        if (bMatch) {
          const [, x1, y1, x2, y2] = bMatch.map(Number);
          bounds = { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
          center = { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
        }
      }

      if (text || contentDesc || clickable) {
        nodes.push({
          text,
          contentDesc,
          className,
          resourceId,
          clickable,
          bounds,
          center,
        });
      }
    }

    return nodes;
  }

  /**
   * Extract a concise, accessible summary of the mobile screen for LLM ingestion.
   * Equivalent to extractDomSummary() on web.
   */
  async extractViewSummary() {
    const xml = await this.dumpHierarchy();
    const nodes = this.parseHierarchy(xml);

    const summary = [];
    for (const node of nodes) {
      const label = node.text || node.contentDesc || "";
      if (!label && !node.clickable) continue;

      const isButton = node.className.includes("Button") || node.clickable;
      const isInput = node.className.includes("EditText");
      const tag = isButton ? "[Btn]" : isInput ? "[Field]" : "[Text]";

      const coord = node.center ? `@(${node.center.x},${node.center.y})` : "";
      summary.push(`${tag} "${label}" ${coord}`.trim());
    }

    return summary.slice(0, 30).join("\n");
  }

  /**
   * Tap on screen coordinates (x, y).
   */
  async tap(x, y) {
    return execAdb(this._args(["shell", "input", "tap", String(x), String(y)]));
  }

  /**
   * Find an element by visible text or content-description and tap its center.
   */
  async tapElement(textOrQuery) {
    const xml = await this.dumpHierarchy();
    const nodes = this.parseHierarchy(xml);
    const target = nodes.find(
      (n) =>
        (n.text && n.text.toLowerCase().includes(textOrQuery.toLowerCase())) ||
        (n.contentDesc && n.contentDesc.toLowerCase().includes(textOrQuery.toLowerCase()))
    );

    if (!target || !target.center) {
      throw new Error(`Element matching "${textOrQuery}" not found on mobile screen.`);
    }

    await this.tap(target.center.x, target.center.y);
    return target;
  }

  /**
   * Type text into the currently focused input.
   */
  async typeText(text) {
    const escaped = text.replace(/\s+/g, "%s");
    return execAdb(this._args(["shell", "input", "text", escaped]));
  }

  /**
   * Press Android hardware / software Back button (KEYCODE_BACK).
   */
  async pressBack() {
    return execAdb(this._args(["shell", "input", "keyevent", "4"]));
  }

  /**
   * Press Android Home button (KEYCODE_HOME).
   */
  async pressHome() {
    return execAdb(this._args(["shell", "input", "keyevent", "3"]));
  }

  /**
   * Swipe gesture on the emulator.
   */
  async swipe(x1, y1, x2, y2, durationMs = 300) {
    return execAdb(
      this._args([
        "shell",
        "input",
        "swipe",
        String(x1),
        String(y1),
        String(x2),
        String(y2),
        String(durationMs),
      ])
    );
  }

  /**
   * Launch the app (or Expo Go).
   */
  async launchApp() {
    return execAdb(
      this._args(["shell", "am", "start", "-n", `${this.packageName}/${this.mainActivity}`])
    );
  }

  /**
   * Force stop the app.
   */
  async stopApp() {
    return execAdb(this._args(["shell", "am", "force-stop", this.packageName]));
  }
}
