function isAllowedLocalRequest(req, port) {
    const allowed = [`localhost:${port}`, `127.0.0.1:${port}`];
    return allowed.includes(req.headers.host) &&
        (!req.headers.origin || allowed.some(host=>req.headers.origin===`http://${host}`)) &&
        req.headers['sec-fetch-site'] !== 'cross-site';
}
function listenLoopback(server, port = 3000, lastPort = 3010) {
    return new Promise((resolve, reject) => {
        const onListening = () => { server.removeListener('error', onError); resolve(server); };
        const onError = error => {
            server.removeListener('listening', onListening);
            if (error.code === 'EADDRINUSE' && port < lastPort) resolve(listenLoopback(server, port + 1, lastPort));
            else reject(error);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
    });
}
module.exports = { isAllowedLocalRequest, listenLoopback };
