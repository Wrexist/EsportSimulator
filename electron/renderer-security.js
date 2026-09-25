function secureWebContents(contents, isTrustedUrl) {
    contents.setWindowOpenHandler(() => ({action:'deny'}));
    contents.on('will-navigate', (event, url) => { if (!isTrustedUrl(url)) event.preventDefault(); });
    contents.on('will-frame-navigate', event => {
        if (!event.isMainFrame || !isTrustedUrl(event.url)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => { if (!isTrustedUrl(url)) event.preventDefault(); });
    contents.on('will-attach-webview', event => event.preventDefault());
}
module.exports = {secureWebContents};
