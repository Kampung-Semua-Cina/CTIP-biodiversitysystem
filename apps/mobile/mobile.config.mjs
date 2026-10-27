// apps/mobile/mobile.config.js
// Automated Mobile Emulator & AI Agent Configuration for Daun Sense
// Configured similarly to apps/web/playwright.config.js
import process from "node:process";
import path from "node:path";

export default {
  // Test directory
  testDir: "./tests",

  // Timeout settings (in milliseconds)
  timeout: 60000,
  actionTimeout: 10000,

  // Android Emulator / Device Settings
  emulator: {
    // If null, the driver will auto-detect the first connected device or running emulator
    targetDeviceId: process.env.ANDROID_SERIAL || null,
    // Android package configuration
    // Default: Expo Go launcher activity, or custom standalone build package
    packageName: process.env.MOBILE_PACKAGE_NAME || "host.exp.exponent",
    mainActivity: process.env.MOBILE_MAIN_ACTIVITY || "host.exp.exponent.LauncherActivity",
    // App URL to open in Expo (if using Expo Go)
    expoAppUrl: process.env.EXPO_APP_URL || "exp://127.0.0.1:8081",
  },

  // AI Agent (Local Ollama) Settings
  ollama: {
    host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    preferredTextModel: process.env.OLLAMA_MODEL || "qwen2.5:3b",
    visionCandidates: ["qwen2.5-vl", "llama3.2-vision", "moondream", "llava", "bakllava"],
    temperature: 0.1,
  },

  // Reporting and Artifacts
  outputDir: path.resolve(process.cwd(), "test-results", "mobile-agent"),
};
