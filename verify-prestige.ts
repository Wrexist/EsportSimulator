import { calculateHltvPrestigeScore, getPrestigeLabel } from "./engine/prestige-system";

// Test Case A: Current Superstar
// 2025: #2, 2024: #6, 2023: #9
const superstarHistory = [
    { year: 2025, rank: 2 },
    { year: 2024, rank: 6 },
    { year: 2023, rank: 9 }
];

// Test Case B: Former Legend (Washed)
// 2019: #3, 2020: #4, 2021: #7
// Current Year: 2025
const washedHistory = [
    { year: 2019, rank: 3 },
    { year: 2020, rank: 4 },
    { year: 2021, rank: 7 }
];

// Test Case C: Consistent Grinder
// 2025: #28, 2024: #34, 2023: #41, 2022: #38
const grinderHistory = [
    { year: 2025, rank: 28 },
    { year: 2024, rank: 34 },
    { year: 2023, rank: 41 },
    { year: 2022, rank: 38 }
];

const currentYear = 2025;

console.log("--- Prestige System Verification ---");

const scoreA = calculateHltvPrestigeScore(superstarHistory, currentYear);
console.log(`Test A (Superstar): ${scoreA} (${getPrestigeLabel(scoreA)})`);
// Expected: ~90-95

const scoreB = calculateHltvPrestigeScore(washedHistory, currentYear);
console.log(`Test B (Washed): ${scoreB} (${getPrestigeLabel(scoreB)})`);
// Expected: ~40-45

const scoreC = calculateHltvPrestigeScore(grinderHistory, currentYear);
console.log(`Test C (Grinder): ${scoreC} (${getPrestigeLabel(scoreC)})`);
// Expected: ~55
