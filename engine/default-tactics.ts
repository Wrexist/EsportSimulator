import type { CustomTactics } from "@/types"

// Fresh object per career; never share editable loadouts across saves.
export function createDefaultTactics(): CustomTactics {
    return {
        ECO: {
          ct: {
            primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] }
            ]
          }
        },
        FORCE: {
          ct: {
            primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] }
            ]
          }
        },
        SEMIBUY: {
          ct: {
            primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] }
            ]
          }
        },
        FULL: {
          ct: {
            primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] }
            ]
          }
        },
        "DOUBLE AWP": {
          ct: {
            primaryWeaponId: "awp", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 1, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "awp", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] }
            ]
          }
        }
      }
}
