// apps/web/public/startup-error.js
// Shows a readable message if the app fails to start (a script or module that
// does not load). Kept in its own file because the Content-Security-Policy in
// public/_headers allows only scripts from this site, not inline ones (F-12).
// Capture any startup errors before React finishes mounting
window.addEventListener('error', function(e) {
  var root = document.getElementById('root');
  if (!root) return;
  if (root.children.length && !root.querySelector('.startup-error')) return;

  var target = e.target;
  var isElem = target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK');
  var src = isElem ? (target.src || target.href) : (e.filename || '');
  var msg = e.message || (isElem ? ('Failed to load resource: ' + src) : 'Startup script error');
  var detail = (e.error && e.error.stack) ? e.error.stack : (src ? ('Source: ' + src + (e.lineno ? (':' + e.lineno) : '')) : '');

  root.innerHTML = '<div class="startup-error" style="padding:28px;font-family:sans-serif;color:#8f2d18;background:#ffffff;margin:32px auto;max-width:620px;border-radius:14px;border:1px solid #e3bebe;box-shadow:0 8px 24px rgba(0,0,0,0.08);">' +
    '<h3 style="margin-top:0;color:#8f2d18;font-size:20px;">Application Startup Error</h3>' +
    '<p style="color:#1d3824;font-size:15px;line-height:1.5;">' + msg + '</p>' +
    (detail ? ('<pre style="background:#f7faf2;padding:12px;border-radius:8px;font-size:12px;color:#3b5643;overflow:auto;white-space:pre-wrap;border:1px solid #dbe6ce;">' + detail + '</pre>') : '') +
    '<div style="margin-top:16px;padding:12px 14px;background:#fef7f2;border-radius:8px;border-left:4px solid #e07a5f;font-size:13px;color:#6b4028;">' +
      '<strong>Ad blocker note:</strong> If you are using an extension such as <em>uBlock Origin</em>, try disabling it for <code>localhost</code> or reloading with <code>Ctrl + Shift + R</code>.' +
    '</div>' +
  '</div>';
}, true); // Important: capture=true catches <script> and module load failures!

window.addEventListener('unhandledrejection', function(e) {
  var root = document.getElementById('root');
  if (!root) return;
  if (root.children.length && !root.querySelector('.startup-error')) return;

  root.innerHTML = '<div class="startup-error" style="padding:28px;font-family:sans-serif;color:#8f2d18;background:#ffffff;margin:32px auto;max-width:620px;border-radius:14px;border:1px solid #e3bebe;box-shadow:0 8px 24px rgba(0,0,0,0.08);">' +
    '<h3 style="margin-top:0;color:#8f2d18;font-size:20px;">Startup Module Error</h3>' +
    '<p style="color:#1d3824;font-size:15px;line-height:1.5;">' + (e.reason ? (e.reason.message || String(e.reason)) : 'A required module failed to load') + '</p>' +
    (e.reason && e.reason.stack ? ('<pre style="background:#f7faf2;padding:12px;border-radius:8px;font-size:12px;color:#3b5643;overflow:auto;white-space:pre-wrap;border:1px solid #dbe6ce;">' + e.reason.stack + '</pre>') : '') +
    '<div style="margin-top:16px;padding:12px 14px;background:#fef7f2;border-radius:8px;border-left:4px solid #e07a5f;font-size:13px;color:#6b4028;">' +
      '<strong>Ad blocker note:</strong> If you are using an extension such as <em>uBlock Origin</em>, try disabling it for <code>localhost</code> or reloading with <code>Ctrl + Shift + R</code>.' +
    '</div>' +
  '</div>';
});
