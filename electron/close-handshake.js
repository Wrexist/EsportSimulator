// The timeout covers receipt of a close request, not the time a player spends
// deciding what to do or the duration of a responsive renderer's save.
function createCloseHandshake(onUnresponsive, timeoutMs = 15000) {
    let timer = null;
    const acknowledge = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };
    return {
        request() {
            acknowledge();
            timer = setTimeout(() => {
                timer = null;
                onUnresponsive();
            }, timeoutMs);
        },
        acknowledge,
        cancel: acknowledge,
    };
}

module.exports = { createCloseHandshake };
