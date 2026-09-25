// Smoke-test the actual production worker in a realm without window/document.
// This catches client-bundler rewrites that ordinary TypeScript tests cannot.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function verifyWorkerBuild() {
    const nextRoot = path.resolve(__dirname, '..', '.next');
    const chunkRoot = path.join(nextRoot, 'static', 'chunks');
    const candidates = fs.readdirSync(chunkRoot).filter(name => name.endsWith('.js')).filter(name => {
        const source = fs.readFileSync(path.join(chunkRoot, name), 'utf8');
        return source.includes('self.onmessage=') && source.includes('PROCESS_WEEK');
    });
    assert.equal(candidates.length, 1, 'Expected exactly one production week-worker entry');
    const entry = path.join(chunkRoot, candidates[0]);
    const messages = [];
    let durableOpens = 0;
    const context = vm.createContext({
        console, setTimeout, clearTimeout, setInterval, clearInterval,
        performance, TextEncoder, TextDecoder, URL, crypto: globalThis.crypto,
        structuredClone,
        indexedDB: { open() { durableOpens++; throw new Error('Compute worker must not open durable storage during startup'); } },
        postMessage: message => messages.push(message),
        location: { href: `http://127.0.0.1/_next/static/chunks/${candidates[0]}` },
    });
    context.self = context;
    context.importScripts = (...urls) => {
        for (const url of urls) {
            assert.ok(url.startsWith('/_next/static/chunks/'), `Unexpected worker chunk URL: ${url}`);
            const file = path.resolve(nextRoot, url.slice('/_next/'.length));
            assert.ok(file.startsWith(chunkRoot + path.sep), 'Worker chunk escaped the build directory');
            vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
        }
    };
    vm.runInContext(fs.readFileSync(entry, 'utf8'), context, { filename: entry });
    // Next's production runtime publishes its startup promise under _N_E.
    // Await it so failures in shared chunks surface as build failures.
    await context._N_E;
    assert.equal(durableOpens, 0, 'Worker startup accessed durable storage');
    assert.equal(typeof context.onmessage, 'function', 'Worker did not install its request handler');
    assert.ok(messages.some(message => message.type === 'READY'), 'Worker did not signal READY');
    console.log(`PASS: production worker starts without browser globals (${candidates[0]})`);
    return { context, messages, entry, durableOpens: () => durableOpens };
}

if (require.main === module) verifyWorkerBuild().catch(error => {
    console.error('Production worker verification failed:', error);
    process.exitCode = 1;
});
module.exports = { verifyWorkerBuild };
