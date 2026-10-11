// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Watch the shared directory outside apps/mobile
config.watchFolders = [
  path.resolve(__dirname, '../shared'),
];

// Ensure modules imported by watchFolders resolve from mobile's node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config;