const { contextBridge, ipcRenderer } = require('electron');

// Bridging Electron to the React app
contextBridge.exposeInMainWorld('electron', {
    steam: {
        getStat: (name) => ipcRenderer.invoke('steam-get-stat', name),
        isAchievementUnlocked: (name) => ipcRenderer.invoke('steam-is-achievement-unlocked', name),
        setStat: (name, value) => ipcRenderer.invoke('steam-set-stat', name, value),
        storeStats: () => ipcRenderer.invoke('steam-store-stats'),
        setAchievement: (name) => ipcRenderer.invoke('steam-set-achievement', name),
        setLeaderboardScore: (name, score) => ipcRenderer.invoke('steam-set-leaderboard-score', name, score),
        setRichPresence: (key, value) => ipcRenderer.invoke('steam-set-rich-presence', key, value),
        writeToCloud: (filename, contents) => ipcRenderer.invoke('steam-cloud-write', filename, contents),
        readFromCloud: (filename) => ipcRenderer.invoke('steam-cloud-read', filename),
        deleteFromCloud: (filename) => ipcRenderer.invoke('steam-cloud-delete', filename),
    },
    window: {
        setFullscreen: (fullscreen) => ipcRenderer.invoke('window-set-fullscreen', fullscreen),
        setSize: (width, height) => ipcRenderer.invoke('window-set-size', width, height),
        getSize: () => ipcRenderer.invoke('window-get-size'),
        isFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
    },
    gpu: {
        getMode: () => ipcRenderer.invoke('gpu-get-mode'),
        setMode: (mode) => ipcRenderer.invoke('gpu-set-mode', mode),
    },
    log: {
        writeError: (report) => ipcRenderer.invoke('log-write-error', report),
    },
    storage: {
        getItem: (key) => ipcRenderer.invoke('storage-get-item', key),
        setItem: (key, value) => ipcRenderer.invoke('storage-set-item', key, value),
        removeItem: (key) => ipcRenderer.invoke('storage-remove-item', key),
        clear: () => ipcRenderer.invoke('storage-clear'),
        getAllKeys: () => ipcRenderer.invoke('storage-get-all-keys'),
    },
    mods: {
        exists: () => ipcRenderer.invoke('mod-exists'),
        read: (filename) => ipcRenderer.invoke('mod-read', filename),
        write: (filename, contents) => ipcRenderer.invoke('mod-write', filename, contents),
        clear: () => ipcRenderer.invoke('mod-clear'),
        getPath: () => ipcRenderer.invoke('mod-path'),
    },
    onAppClose: (callback) => ipcRenderer.on('app-close-intent', (_, ...args) => callback(...args)),
    confirmAppClose: () => ipcRenderer.invoke('app-close-confirmed'),
    cancelAppClose: () => ipcRenderer.invoke('app-close-cancelled'),
});
