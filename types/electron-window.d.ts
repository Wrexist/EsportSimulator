export { };

/** A subscribed Steam Workshop item, annotated with our manifest metadata. */
export interface WorkshopModItem {
    id: string;
    installed: boolean;
    needsUpdate: boolean;
    folder: string | null;
    sizeOnDisk: number;
    title: string;
    author: string;
    teams?: number;
    players?: number;
    /** True when the item carries an Esports Manager mod manifest. */
    isEmMod: boolean;
}

/** Which overlay source is currently live. */
export type ActiveModPointer =
    | { source: "community" }
    | { source: "workshop"; workshopId: string };

declare global {
    interface Window {
        electron: {
            steam: {
                // identity
                getSteamId: () => Promise<string | null>;
                getPersonaName: () => Promise<string | null>;
                // stats
                getStat: (name: string) => Promise<number | null>;
                setStat: (name: string, value: number) => Promise<boolean>;
                storeStats: () => Promise<boolean>;
                // achievements
                unlockAchievement: (name: string) => Promise<boolean>;
                /** @deprecated use unlockAchievement */
                setAchievement: (name: string) => Promise<boolean>;
                isAchievementUnlocked: (name: string) => Promise<boolean>;
                // leaderboards
                setLeaderboardScore: (name: string, score: number) => Promise<boolean>;
                // rich presence
                setRichPresence: (key: string, value: string) => Promise<boolean>;
                getRichPresence: (key: string) => Promise<string | null>;
                // cloud saves
                writeToCloud: (filename: string, contents: string) => Promise<boolean>;
                readFromCloud: (filename: string) => Promise<string | null>;
                deleteFromCloud: (filename: string) => Promise<boolean>;
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
            workshop?: {
                available: () => Promise<boolean>;
                list: () => Promise<WorkshopModItem[]>;
                getActive: () => Promise<ActiveModPointer>;
                setActive: (payload: ActiveModPointer) => Promise<boolean>;
                subscribe: (id: string) => Promise<boolean>;
                unsubscribe: (id: string) => Promise<boolean>;
                open: (id?: string) => Promise<boolean>;
            };
            onAppClose: (callback: () => void) => void;
            confirmAppClose: () => Promise<boolean>;
            cancelAppClose: () => Promise<boolean>;
        };
    }
}
