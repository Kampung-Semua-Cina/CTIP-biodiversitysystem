// apps/mobile/app.config.js
// app.json holds the app's settings; this only adds the version, from
// scripts/version.mjs (MAJOR.MINOR from the root package.json, then the commit
// count). Screens read it from Constants.expoConfig.extra.appVersion.
// android.versionCode is not set here: EAS raises it on every build
// (eas.json: appVersionSource "remote", autoIncrement).
import { getVersion } from '../../scripts/version.mjs';

export default ({ config }) => {
  const appVersion = getVersion();
  return {
    ...config,
    version: appVersion.version,
    extra: { ...config.extra, appVersion },
  };
};
