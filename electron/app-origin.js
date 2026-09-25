function isAllowedAppNavigation(value, port) {
    try {
        const url = new URL(value);
        if (url.username || url.password) return false;
        if (!/^[0-9]{1,5}$/.test(String(port)) || Number(port)<1 || Number(port)>65535) return false;
        if (decodeURIComponent(url.pathname).startsWith('/mod-assets')) return false;
        return url.origin === `http://localhost:${port}`;
    } catch (_) {
        return false;
    }
}

function isTrustedMainFrame(event, contents, originAllowed) {
    try {
        return !!contents && !contents.isDestroyed() && event?.sender === contents &&
            !!event.senderFrame && event.senderFrame === contents.mainFrame &&
            originAllowed(event.senderFrame.url) && originAllowed(contents.getURL());
    } catch (_) { return false; }
}

module.exports = { isAllowedAppNavigation, isTrustedMainFrame };
