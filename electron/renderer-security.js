// Applied to every WebContents (web-contents-created), including the main window.
// No renderer may open a second window, navigate away from the app origin,
// attach a <webview>, or load a child frame. Allowlisted HTTPS links are handed
// to the OS browser instead (see external-links.js).
function secureWebContents(contents, isTrustedUrl, { openExternal, log = () => {} } = {}) {
    contents.setWindowOpenHandler(details => {
        const url = details?.url;
        if (typeof openExternal === 'function' && !isTrustedUrl(url)) openExternal(url);
        else log(`[Security] Denied window.open for ${String(url).slice(0, 200)}`);
        return { action: 'deny' };
    });
    contents.on('will-frame-navigate', event => {
        if (event.isMainFrame && isTrustedUrl(event.url)) return;
        event.preventDefault();
        log(`[Security] Blocked ${event.isMainFrame ? 'navigation' : 'child-frame navigation'} to ${String(event.url).slice(0, 200)}`);
        // Electron emits no will-navigate after will-frame-navigate is cancelled,
        // so a plain external <a href> click is routed to the OS browser here.
        if (event.isMainFrame && typeof openExternal === 'function') openExternal(event.url);
    });
    contents.on('will-navigate', (event, url) => {
        if (!isTrustedUrl(url)) { event.preventDefault(); log(`[Security] Blocked navigation to ${String(url).slice(0, 200)}`); }
    });
    contents.on('will-redirect', (event, url) => {
        if (!isTrustedUrl(url)) { event.preventDefault(); log(`[Security] Blocked redirect to ${String(url).slice(0, 200)}`); }
    });
    contents.on('will-attach-webview', event => { event.preventDefault(); log('[Security] Blocked <webview> attach'); });
}

// blob: downloads created by the app itself (Map Studio / lab exports) keep
// working; any other download, including data: and remote URLs, is cancelled.
function isTrustedDownloadUrl(value, isTrustedUrl) {
    try {
        const url = new URL(value);
        if (url.protocol === 'blob:') return isTrustedUrl(url.pathname);
        return isTrustedUrl(url.href);
    } catch (_) { return false; }
}

function secureSession(session, isTrustedUrl, { log = () => {} } = {}) {
    // The game needs no permission (geolocation, notifications, media, midi,
    // pointerLock, clipboard-read, HID/serial/USB, display capture, ...).
    session.setPermissionRequestHandler((_contents, permission, callback) => {
        log(`[Security] Denied permission request: ${permission}`);
        callback(false);
    });
    session.setPermissionCheckHandler(() => false);
    if (typeof session.setDevicePermissionHandler === 'function') session.setDevicePermissionHandler(() => false);
    session.on('will-download', (event, item) => {
        let url = '';
        try { url = item.getURL(); } catch (_) { /* treat as untrusted */ }
        if (!isTrustedDownloadUrl(url, isTrustedUrl)) {
            event.preventDefault();
            log(`[Security] Blocked download from ${String(url).slice(0, 200)}`);
        }
    });
}

module.exports = { secureWebContents, secureSession, isTrustedDownloadUrl };
