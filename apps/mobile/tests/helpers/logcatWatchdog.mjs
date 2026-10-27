// apps/mobile/tests/helpers/logcatWatchdog.js
// Mobile Bug & Crash Watchdog for Daun Sense
// Listens to ADB Logcat to capture React Native Redbox, unhandled rejections, and Android runtime crashes.
import { spawn } from "node:child_process";
import { findAdbBinary } from "./mobileDriver.mjs";

const ADB = findAdbBinary();

/**
 * Attach an active crash watchdog to the specified device.
 */
export function attachLogcatWatchdog(deviceId = null) {
  const crashes = [];
  const args = deviceId ? ["-s", deviceId] : [];

  // Clear previous logcat buffer
  try {
    const clearProc = spawn(ADB, [...args, "logcat", "-c"]);
    clearProc.on("error", () => {});
  } catch {
    // Ignore clear error if adb is not currently ready
  }

  // Spawn logcat process listening for errors
  let logcatProcess = null;
  try {
    logcatProcess = spawn(ADB, [...args, "logcat", "-v", "time", "*:E"]);

    logcatProcess.stdout.on("data", (data) => {
      const text = data.toString("utf8");
      // Filter for significant React Native and Android application crashes
      if (
        text.includes("ReactNativeJS") ||
        text.includes("FATAL EXCEPTION") ||
        text.includes("AndroidRuntime")
      ) {
        // Exclude benign or expected network disconnect warnings
        if (
          !text.includes("favicon") &&
          !text.includes("401") &&
          !text.includes("Network request failed")
        ) {
          crashes.push(text.trim());
        }
      }
    });

    logcatProcess.on("error", () => {
      // Handled gracefully if adb process fails
    });
  } catch {
    // Graceful fallback if adb process fails to spawn
  }

  return {
    /**
     * Assert that no crashes or React Native unhandled exceptions were logged.
     */
    assertClean(context = "") {
      if (crashes.length > 0) {
        const msg = `Mobile crashes/exceptions detected in ${context}:\n${crashes.join("\n---\n")}`;
        throw new Error(msg);
      }
    },

    /**
     * Retrieve all logged crashes.
     */
    getCrashes() {
      return [...crashes];
    },

    /**
     * Stop and cleanup the background logcat listener.
     */
    stop() {
      if (logcatProcess && !logcatProcess.killed && logcatProcess.pid) {
        try {
          logcatProcess.kill();
        } catch {
          // Process already exited or failed to spawn
        }
      }
    },
  };
}
