
// Mock Interface
interface HltvRankingEntry {
    year: number;
    rank: number;
}

// System Logic (Copied for verification)
function getYearWeight(yearDiff: number): number {
    const weights = [1.0, 0.65, 0.42, 0.26, 0.15, 0.08, 0.04];
    return weights[yearDiff] ?? 0;
}

function getRankBaseValue(rank: number): number {
    if (rank <= 3) return 100;
    if (rank <= 5) return 92;
    if (rank <= 10) return 82;
    if (rank <= 20) return 70;
    if (rank <= 30) return 55;
    if (rank <= 50) return 40;
    if (rank <= 75) return 28;
    if (rank <= 100) return 18;
    return 0;
}

function getConfidenceModifier(rank: number): number {
    if (rank <= 20) return 1.0;
    if (rank <= 50) return 0.75;
    return 0.6;
}

function calculateHltvPrestigeScore(
    hltvHistory: HltvRankingEntry[] | undefined,
    currentYear: number
): number {
    if (!hltvHistory || hltvHistory.length === 0) return 0;

    let weightedSum = 0;
    let weightTotal = 0;

    for (const entry of hltvHistory) {
        const yearDiff = currentYear - entry.year;

        if (yearDiff < 0 || yearDiff > 6) continue;

        const yearW = getYearWeight(yearDiff);
        const base = getRankBaseValue(rankBaseValue(entry.rank)); // Wait, self correction, checking logic below
        const confidence = getConfidenceModifier(entry.rank);

        const value = getRankBaseValue(entry.rank) * confidence * yearW;

        weightedSum += value;
        weightTotal += yearW;
    }

    if (weightTotal === 0) return 0;

    const score = weightedSum / weightTotal;
    return Math.min(Math.round(score), 100);
}

function rankBaseValue(rank: number) { return rank; } // Dummy for previous copy-paste error correction

function getPrestigeLabel(score: number): string {
    if (score >= 90) return "Global Superstar";
    if (score >= 80) return "World-Class";
    if (score >= 70) return "Elite";
    if (score >= 60) return "Star Player";
    if (score >= 50) return "Established Pro";
    if (score >= 40) return "Proven Competitor";
    if (score >= 30) return "Notable Name";
    if (score >= 10) return "Rising Talent";
    return "Unknown";
}

// Test Data
const currentYear = 2025;

const superstarHistory = [
    { year: 2025, rank: 2 },
    { year: 2024, rank: 6 },
    { year: 2023, rank: 9 }
];

const washedHistory = [
    { year: 2019, rank: 3 },
    { year: 2020, rank: 4 },
    { year: 2021, rank: 7 }
];

const grinderHistory = [
    { year: 2025, rank: 28 },
    { year: 2024, rank: 34 },
    { year: 2023, rank: 41 },
    { year: 2022, rank: 38 }
];

// Execution
const scoreA = calculateHltvPrestigeScore(superstarHistory, currentYear);
console.log(`Test A (Superstar): ${scoreA} (${getPrestigeLabel(scoreA)})`);

const scoreB = calculateHltvPrestigeScore(washedHistory, currentYear);
console.log(`Test B (Washed): ${scoreB} (${getPrestigeLabel(scoreB)})`);

const scoreC = calculateHltvPrestigeScore(grinderHistory, currentYear);
console.log(`Test C (Grinder): ${scoreC} (${getPrestigeLabel(scoreC)})`);
