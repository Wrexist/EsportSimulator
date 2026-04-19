export { };

declare global {
    interface Window {
        electron: {
            steam: {
                getStat: (name: string) => Promise<number | null>;
                isAchievementUnlocked: (name: string) => Promise<boolean>;
                setStat: (name: string, value: number) => Promise<boolean>;
                storeStats: () => Promise<boolean>;
                setAchievement: (name: string) => Promise<boolean>;
                setLeaderboardScore: (name: string, score: number) => Promise<boolean>;
            };
            window: {
                setFullscreen: (fullscreen: boolean) => Promise<boolean>;
                setSize: (width: number, height: number) => Promise<boolean>;
                getSize: () => Promise<{ width: number; height: number } | null>;
                isFullscreen: () => Promise<boolean>;
            };
            storage: {
                getItem: (key: string) => Promise<string | null>;
                setItem: (key: string, value: string) => Promise<boolean>;
                removeItem: (key: string) => Promise<boolean>;
                clear: () => Promise<boolean>;
                getAllKeys: () => Promise<string[]>;
            };
            mods?: {
                exists: () => Promise<boolean>;
                read: (filename: string) => Promise<string | null>;
                write: (filename: string, contents: string) => Promise<boolean>;
                clear: () => Promise<boolean>;
                getPath: () => Promise<string | null>;
            };
            onAppClose: (callback: () => void) => void;
            confirmAppClose: () => Promise<boolean>;
            cancelAppClose: () => Promise<boolean>;
        };
    }
}
