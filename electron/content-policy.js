const MOD_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
// Next's inline flight/bootstrap scripts and React inline styles still need
// unsafe-inline. The real production renderer/worker smoke passes without eval.
const APP_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';";
function contentPolicy(url, development = false) {
    try { if (decodeURIComponent(new URL(url).pathname).startsWith('/mod-assets')) return MOD_CSP; } catch (_) { /* app loading/error document */ }
    return development ? APP_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'") : APP_CSP;
}
module.exports = { contentPolicy, APP_CSP, MOD_CSP };
