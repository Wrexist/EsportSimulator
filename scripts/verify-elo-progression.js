
const LEAGUE_K_FACTORS = {
    PROVISIONAL: 40,
    ELITE: 8,
    PROFESSIONAL: 20,
    AMATEUR: 32
};

const UPSET_BONUS_MAX = 0.3;

function calculateEloChange(
    winnerElo,
    loserElo,
    winnerRank,
    loserRank,
    roundDifferential
) {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const actualWinner = 1;

    // Simplified K selection for testing
    let winnerK = 32;
    if (winnerRank <= 10) winnerK = LEAGUE_K_FACTORS.ELITE;
    else if (winnerRank <= 40) winnerK = LEAGUE_K_FACTORS.PROFESSIONAL;
    else winnerK = LEAGUE_K_FACTORS.AMATEUR;

    let loserK = 32;
    if (loserRank <= 10) loserK = LEAGUE_K_FACTORS.ELITE;
    else if (loserRank <= 40) loserK = LEAGUE_K_FACTORS.PROFESSIONAL;
    else loserK = LEAGUE_K_FACTORS.AMATEUR;

    // Upset bonus
    const rankDiff = winnerRank - loserRank;
    if (rankDiff > 5) {
        const upsetMultiplier = 1 + Math.min(rankDiff / 30, UPSET_BONUS_MAX);
        winnerK *= upsetMultiplier;
    }

    let winnerChange = Math.round(winnerK * (actualWinner - expectedWinner));
    const movMultiplier = 1 + (Math.min(16, Math.max(0, roundDifferential)) / 16) * 0.25;
    winnerChange = Math.round(winnerChange * movMultiplier);

    const expectedLoser = 1 - expectedWinner;
    const actualLoser = 0;
    let loserChange = Math.round(loserK * (actualLoser - expectedLoser));
    loserChange = Math.round(loserChange * movMultiplier);

    return { winnerChange, loserChange };
}

console.log("=== Testing Slower Ranking Progression ===\n");

// Case 1: Elite vs Elite (#1 vs #2), close game
console.log("Case 1: Elite vs Elite (#1 vs #2), round diff 2 (13-11)");
console.log(calculateEloChange(1600, 1580, 1, 2, 2));

// Case 2: Amateur vs Amateur (#50 vs #51), stomp
console.log("\nCase 2: Amateur vs Amateur (#50 vs #51), round diff 13 (13-0)");
console.log(calculateEloChange(1000, 980, 50, 51, 13));

// Case 3: Upset (#40 vs #5)
console.log("\nCase 3: Upset (#40 beats #5), round diff 2");
console.log(calculateEloChange(1150, 1450, 40, 5, 2));

// Compare with OLD values (approximate)
// Elite K was 10, Amateur was 50, MOV was 0.5, Upset was 0.5
function calculateOldEloChange(winnerElo, loserElo, winnerRank, loserRank, roundDifferential) {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    let winnerK = winnerRank <= 10 ? 10 : (winnerRank <= 40 ? 25 : 50);
    let loserK = loserRank <= 10 ? 10 : (loserRank <= 40 ? 25 : 50);

    const rankDiff = winnerRank - loserRank;
    if (rankDiff > 5) {
        const upsetMultiplier = 1 + Math.min(rankDiff / 30, 0.5);
        winnerK *= upsetMultiplier;
    }

    let winnerChange = Math.round(winnerK * (1 - expectedWinner));
    const movMultiplier = 1 + (Math.min(16, Math.max(0, roundDifferential)) / 16) * 0.5;
    winnerChange = Math.round(winnerChange * movMultiplier);

    let loserChange = Math.round(loserK * (0 - (1 - expectedWinner)));
    loserChange = Math.round(loserChange * movMultiplier);

    return { winnerChange, loserChange };
}

console.log("\n=== COMPARING WITH OLD MATH ===");
console.log("Elite vs Elite (#1 vs #2), Round Diff 2");
console.log("Old:", calculateOldEloChange(1600, 1580, 1, 2, 2));
console.log("New:", calculateEloChange(1600, 1580, 1, 2, 2));

console.log("\nAmateur vs Amateur (#50 vs #51), Round Diff 13");
console.log("Old:", calculateOldEloChange(1000, 980, 50, 51, 13));
console.log("New:", calculateEloChange(1000, 980, 50, 51, 13));

console.log("\nUpset (#40 beats #5), Round Diff 2");
console.log("Old:", calculateOldEloChange(1150, 1450, 40, 5, 2));
console.log("New:", calculateEloChange(1150, 1450, 40, 5, 2));
