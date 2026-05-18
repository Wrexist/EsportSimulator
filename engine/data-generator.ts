// Generates initial game data for Pro FPS esports manager
import type {
  Team,
  Player,
  PlayerStats,
  Match,
  Tournament,
  Role,
  EquipmentItem,
  Coach,
  Analyst,
  Psychologist,
} from "@/types/game"
import { SeededRNG } from "./rng"

export class DataGenerator {
  private static rng: SeededRNG = new SeededRNG(42)
  private static idCounter = 0

  /** Set the seeded RNG instance (does NOT reset counters to prevent ID collisions) */
  static setRNG(rng: SeededRNG): void {
    this.rng = rng
  }

  /** Full reset: set RNG and reset all counters. Only use at game initialization. */
  static reset(rng: SeededRNG): void {
    this.rng = rng
    this.idCounter = 0
    this.usedNicknames.clear()
    this.nicknameCounter = 0
  }

  /** Generate a deterministic unique ID */
  private static nextId(prefix: string): string {
    return `${prefix}_${++this.idCounter}`
  }
  private static firstNames = [
    "Alexander",
    "Nikola",
    "Mathieu",
    "Robin",
    "Olof",
    "Jonathan",
    "Peter",
    "Fredrik",
    "Dennis",
    "Jesper",
    "Marcelo",
    "Gabriel",
    "Jake",
    "Nathan",
    "Tyler",
    "Jordan",
    "Kevin",
    "Spencer",
    "Russel",
    "Keith",
    "Dmitry",
    "Vladislav",
    "Alexey",
    "Kirill",
    "Danil",
  ]

  private static lastNames = [
    "Kostyliev",
    "Kovač",
    "Herbaut",
    "Koenig",
    "Kajbjer",
    "Berg",
    "Rasmussen",
    "Lindberg",
    "Edman",
    "Wecksell",
    "David",
    "Toledo",
    "Yip",
    "Schmitt",
    "Latham",
    "Russell",
    "Landstrom",
    "Martin",
    "Van Dulken",
    "Markus",
    "Simchuk",
    "Emaev",
    "Rykhtorov",
    "Mikhaylov",
    "Ishutin",
  ]

  private static nicknames = [
    "v4ltz",
    "N1Ko",
    "Zyvo0",
    "dev1xe",
    "karigen",
    "raen",
    "froozen",
    "rolpz",
    "Tw1stz",
    "NAVV",
    "ElyG",
    "Stewy2X",
    "autopilot",
    "DASH",
    "Skadooble",
    "jxs",
    "AZX",
    "jxaem",
    "electr0nix",
    "Perfectonic",
    "b1ix",
    "sdx",
    "Ax2Le",
    "sh2r0",
    "intrrz",
    "Jumi",
    "qikerz",
    "YETZ",
    "cadwoN",
    "stavr",
    "TeShaa",
    "blazeF",
    "Mavix",
    "dupreee",
    "gl2ve",
  ]

  private static teamNames = [
    "Natus Vincera",
    "Phaze Syndicate",
    "Vitalis",
    "G-Two Gaming",
    "Valiant",
    "ANCE",
    "Cumulus9",
    "Tide",
    "Nebula Racing",
    "Complect",
    "FORIA",
    "Imperius",
    "MB Esports",
    "Sting Gaming",
    "Phantom",
    "Montegra",
    "Gamer League",
    "Apex Peaks",
    "BIG Kings",
    "Mouzen",
    "Astraflux",
    "Phanatic",
  ]

  private static regions = ["EU", "NA", "CIS", "BR", "OCE", "ASIA"]
  private static nationalities = [
    "Denmark",
    "Sweden",
    "France",
    "Ukraine",
    "Russia",
    "USA",
    "Canada",
    "Brazil",
    "Poland",
    "Germany",
    "Finland",
    "Norway",
    "UK",
    "Spain",
    "Portugal",
    "Australia",
  ]

  private static usedNicknames = new Set<string>()
  private static nicknameCounter = 0

  private static generateNickname(): string {
    let nickname: string
    do {
      if (this.nicknameCounter < this.nicknames.length && this.rng.next() > 0.3) {
        nickname = this.nicknames[this.nicknameCounter++]
      } else {
        nickname = `Player${Math.floor(this.rng.next() * 10000)}`
      }
    } while (this.usedNicknames.has(nickname))

    this.usedNicknames.add(nickname)
    return nickname
  }

  private static generatePlayerStats(potential: number): PlayerStats {
    const variance = () => this.rng.next() * 15 - 7.5
    const base = Math.max(1, Math.min(100, potential - 10 + this.rng.next() * 20))

    return {
      // Technical stats
      skill: Math.round(Math.max(1, Math.min(100, base + variance()))),
      rifle: Math.round(Math.max(1, Math.min(100, base + variance()))),
      awp: Math.round(Math.max(1, Math.min(100, base + variance()))),
      pistol: Math.round(Math.max(1, Math.min(100, base + variance()))),
      grenades: Math.round(Math.max(1, Math.min(100, base + variance()))),
      creativity: Math.round(Math.max(1, Math.min(100, base + variance()))),
      clutch: Math.round(Math.max(1, Math.min(100, base + variance()))),
      tactic: Math.round(Math.max(1, Math.min(100, base + variance()))),

      // Mental stats
      leader: Math.round(Math.max(1, Math.min(100, base + variance()))),
      teamwork: Math.round(Math.max(1, Math.min(100, base + variance()))),
      morale: Math.round(Math.max(1, Math.min(100, base + variance()))),
      amicability: Math.round(Math.max(1, Math.min(100, base + variance()))),
      productivity: Math.round(Math.max(1, Math.min(100, base + variance()))),
      stressResistance: Math.round(Math.max(1, Math.min(100, base + variance()))),
      loyalty: Math.round(Math.max(1, Math.min(100, base + variance()))),

      // Physical stats
      reaction: Math.round(Math.max(1, Math.min(100, base + variance()))),
      eyesight: Math.round(Math.max(1, Math.min(100, base + variance()))),
      health: Math.round(Math.max(1, Math.min(100, base + variance()))),
      strength: Math.round(Math.max(1, Math.min(100, base + variance()))),
      endurance: Math.round(Math.max(1, Math.min(100, base + variance()))),
    }
  }

  static generatePlayer(role: Role, quality: "low" | "mid" | "high" = "mid"): Player {
    const potentialRange = {
      low: [30, 50],
      mid: [50, 75],
      high: [75, 95],
    }

    const [minPot, maxPot] = potentialRange[quality]
    const potential = minPot + this.rng.next() * (maxPot - minPot)

    const age = 18 + Math.floor(this.rng.next() * 9)
    const peakAge = 23 + Math.floor(this.rng.next() * 3)

    const firstName = this.firstNames[Math.floor(this.rng.next() * this.firstNames.length)]
    const lastName = this.lastNames[Math.floor(this.rng.next() * this.lastNames.length)]
    const nickname = this.generateNickname()
    const nationality = this.nationalities[Math.floor(this.rng.next() * this.nationalities.length)]

    const stats = this.generatePlayerStats(potential)

    // Role-specific stat adjustments (stats are 0-100 scale)
    if (role === "awper") {
      stats.awp = Math.min(100, stats.awp + 3)
    } else if (role === "igl") {
      stats.leader = Math.min(100, stats.leader + 4)
      stats.tactic = Math.min(100, stats.tactic + 3)
    } else if (role === "entry") {
      stats.skill = Math.min(100, stats.skill + 2)
      stats.reaction = Math.min(100, stats.reaction + 2)
    }

    const baseSalary = (potential / 100) * 50000
    const salaryVariance = baseSalary * 0.3

    return {
      id: this.nextId("player"),
      firstName,
      lastName,
      nickname,
      age,
      nationality,
      role,
      stats,
      form: 70 + Math.floor(this.rng.next() * 30),
      fatigue: Math.floor(this.rng.next() * 20),
      morale: 75 + Math.floor(this.rng.next() * 25),
      potential,
      peakAge,
      salary: Math.floor(baseSalary + this.rng.next() * salaryVariance),
      contract: {
        yearsRemaining: 1 + Math.floor(this.rng.next() * 3),
        buyoutClause: Math.floor((potential / 100) * 800000 + this.rng.next() * 200000),
      },
      careerStats: {
        matchesPlayed: Math.floor(this.rng.next() * 100),
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        rating: 0,
      },
      energy: 100,
      maxEnergy: 100,
    }
  }

  static generateTeam(name?: string, tier: "top" | "mid" | "lower" = "mid", region?: string): Team {
    const roles: Role[] = ["awper", "rifler", "entry", "igl", "support"]
    const quality = tier === "top" ? "high" : tier === "mid" ? "mid" : "low"

    const roster = roles.map((role) => this.generatePlayer(role, quality))

    const baseMoneyByTier = {
      top: 5000000,
      mid: 2000000,
      lower: 800000,
    }

    const baseFansByTier = {
      top: 500000,
      mid: 150000,
      lower: 50000,
    }

    const facilitiesByTier = {
      top: { training: 8, house: 9, analysis: 8 },
      mid: { training: 5, house: 6, analysis: 5 },
      lower: { training: 3, house: 4, analysis: 3 },
    }

    const facilities = facilitiesByTier[tier]

    // Generate staff based on tier
    let coach: Coach | undefined
    let analyst: Analyst | undefined
    let psychologist: Psychologist | undefined

    if (tier === "top" || (tier === "mid" && this.rng.next() > 0.3)) {
      coach = this.generateCoach(tier)
    }

    if (tier === "top" || (tier === "mid" && this.rng.next() > 0.5)) {
      analyst = this.generateAnalyst(tier)
    }

    if (tier === "top" && this.rng.next() > 0.5) {
      psychologist = this.generatePsychologist(tier)
    }

    const weeklyIncome = tier === "top" ? 100000 : tier === "mid" ? 40000 : 15000
    const totalSalaries =
      roster.reduce((sum, p) => sum + p.salary, 0) +
      (coach?.salary || 0) +
      (analyst?.salary || 0) +
      (psychologist?.salary || 0)

    return {
      id: this.nextId("team"),
      name: name || this.teamNames[Math.floor(this.rng.next() * this.teamNames.length)],
      region: region || this.regions[Math.floor(this.rng.next() * this.regions.length)],
      tier,
      elo: tier === "top" ? 1800 + Math.floor(this.rng.next() * 200) : tier === "mid" ? 1400 + Math.floor(this.rng.next() * 300) : 1000 + Math.floor(this.rng.next() * 300),
      leagueTier: tier === "top" ? "S_TIER" : tier === "mid" ? "A_TIER" : "B_TIER",
      roster,
      money: baseMoneyByTier[tier],
      weeklyIncome,
      weeklyExpenses: totalSalaries,
      reputation: tier === "top" ? 85 : tier === "mid" ? 55 : 35,
      fanbase: baseFansByTier[tier],
      facilities: {
        trainingCenter: facilities.training,
        gamingHouse: facilities.house,
        analysisRoom: facilities.analysis,
      },
      equipment: [],
      staff: {
        coach,
        analyst,
        psychologist,
      },
      trainingSlotsUsed: 0,
      maxTrainingSlots: 10,

      // Phase 24: Fan & Merch
      followers: baseFansByTier[tier] || 0,
      merchStoreLevel: 1,
      activeMerchItems: [],
    }
  }

  private static generateCoach(tier: "top" | "mid" | "lower"): Coach {
    const levelByTier = {
      top: [3, 5],
      mid: [2, 4],
      lower: [1, 3],
    }

    const [minLevel, maxLevel] = levelByTier[tier]
    const level = minLevel + Math.floor(this.rng.next() * (maxLevel - minLevel))

    const firstName = this.firstNames[Math.floor(this.rng.next() * this.firstNames.length)]
    const lastName = this.lastNames[Math.floor(this.rng.next() * this.lastNames.length)]

    return {
      id: this.nextId("coach"),
      name: `${firstName} ${lastName}`,
      age: 28 + Math.floor(this.rng.next() * 15),
      nationality: this.nationalities[Math.floor(this.rng.next() * this.nationalities.length)],
      level,
      specialization: (["tactical", "mental", "individual"] as const)[Math.floor(this.rng.next() * 3)],
      salary: level * 1500 + Math.floor(this.rng.next() * 5000),
      contract: {
        yearsRemaining: 1 + Math.floor(this.rng.next() * 3),
      },
      buffs: {
        tactic: level / 2,
        morale: level / 3,
      },
    }
  }

  private static generateAnalyst(tier: "top" | "mid" | "lower"): Analyst {
    const levelByTier = {
      top: [3, 5],
      mid: [2, 4],
      lower: [1, 3],
    }

    const [minLevel, maxLevel] = levelByTier[tier]
    const level = minLevel + Math.floor(this.rng.next() * (maxLevel - minLevel))

    const firstName = this.firstNames[Math.floor(this.rng.next() * this.firstNames.length)]
    const lastName = this.lastNames[Math.floor(this.rng.next() * this.lastNames.length)]

    return {
      id: this.nextId("analyst"),
      name: `${firstName} ${lastName}`,
      age: 24 + Math.floor(this.rng.next() * 10),
      nationality: this.nationalities[Math.floor(this.rng.next() * this.nationalities.length)],
      level,
      salary: level * 1200 + Math.floor(this.rng.next() * 3000),
      contract: {
        yearsRemaining: 1 + Math.floor(this.rng.next() * 2),
      },
      buffs: {
        mapVeto: level,
      },
    }
  }

  private static generatePsychologist(tier: "top" | "mid" | "lower"): Psychologist {
    const levelByTier = {
      top: [3, 5],
      mid: [2, 4],
      lower: [1, 3],
    }

    const [minLevel, maxLevel] = levelByTier[tier]
    const level = minLevel + Math.floor(this.rng.next() * (maxLevel - minLevel))

    const firstName = this.firstNames[Math.floor(this.rng.next() * this.firstNames.length)]
    const lastName = this.lastNames[Math.floor(this.rng.next() * this.lastNames.length)]

    return {
      id: this.nextId("psych"),
      name: `${firstName} ${lastName}`,
      age: 30 + Math.floor(this.rng.next() * 15),
      nationality: this.nationalities[Math.floor(this.rng.next() * this.nationalities.length)],
      level,
      salary: level * 1800 + Math.floor(this.rng.next() * 4000),
      contract: {
        yearsRemaining: 1 + Math.floor(this.rng.next() * 2),
      },
      buffs: {
        moraleStability: level / 2,
        stressResistance: level / 3,
      },
    }
  }

  static generateTeams(count: number): Team[] {
    const teams: Team[] = []
    const topCount = Math.ceil(count * 0.25)
    const midCount = Math.ceil(count * 0.45)
    const lowerCount = count - topCount - midCount

    for (let i = 0; i < topCount; i++) {
      teams.push(this.generateTeam(undefined, "top"))
    }
    for (let i = 0; i < midCount; i++) {
      teams.push(this.generateTeam(undefined, "mid"))
    }
    for (let i = 0; i < lowerCount; i++) {
      teams.push(this.generateTeam(undefined, "lower"))
    }

    return teams
  }

  static generateTournament(teams: Team[], name: string, tier: "s" | "a" | "b" | "c", startDate: Date): Tournament {
    const prizePools = {
      s: 1000000,
      a: 500000,
      b: 150000,
      c: 50000,
    }

    return {
      id: this.nextId("tournament"),
      name,
      tier,
      prizePool: prizePools[tier],
      teams,
      format: teams.length >= 16 ? "bracket" : teams.length >= 8 ? "swiss" : "league",
      currentStage: "Group Stage",
      standings: teams.map((team) => ({
        team,
        played: 0,
        wins: 0,
        losses: 0,
        points: 0,
        mapDiff: 0,
      })),
    }
  }

  static generateSchedule(tournament: Tournament, startDate: Date): Match[] {
    const matches: Match[] = []
    const teams = tournament.teams

    // Generate round-robin matches
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const matchDate = new Date(startDate)
        matchDate.setDate(matchDate.getDate() + matches.length * 3)

        matches.push({
          id: this.nextId("match"),
          homeTeam: teams[i],
          awayTeam: teams[j],
          competition: tournament.name,
          stage: tournament.currentStage,
          date: matchDate,
          bestOf: 3,
          seed: Math.floor(this.rng.next() * 1000000),
        })
      }
    }

    return matches
  }

  static generateEquipmentItems(): EquipmentItem[] {
    return [
      {
        id: "mouse_1",
        name: "Featherweight Pro Mouse",
        type: "MOUSE",
        tier: 3,
        bonus: { stat: "reaction", value: 2 },
        weeklyCost: 50,
        purchasedWeek: 0,
      },
      {
        id: "mouse_2",
        name: "Pro Tournament Mouse",
        type: "MOUSE",
        tier: 2,
        bonus: { stat: "reaction", value: 1 },
        weeklyCost: 30,
        purchasedWeek: 0,
      },
      {
        id: "keyboard_1",
        name: "Magnetic Switch Pro Keyboard",
        type: "KEYBOARD",
        tier: 3,
        bonus: { stat: "skill", value: 2 },
        weeklyCost: 60,
        purchasedWeek: 0,
      },
      {
        id: "monitor_1",
        name: "Pro Tournament 360Hz Monitor",
        type: "MONITOR",
        tier: 3,
        bonus: { stat: "reaction", value: 3 },
        weeklyCost: 100,
        purchasedWeek: 0,
      },
      {
        id: "monitor_2",
        name: "Pro 240Hz Gaming Monitor",
        type: "MONITOR",
        tier: 2,
        bonus: { stat: "reaction", value: 2 },
        weeklyCost: 75,
        purchasedWeek: 0,
      },
      {
        id: "chair_1",
        name: "Ergonomic Pro Chair",
        type: "CHAIR",
        tier: 3,
        bonus: { stat: "clutch", value: 3 },
        weeklyCost: 150,
        purchasedWeek: 0,
      },
      {
        id: "chair_2",
        name: "Premium Gaming Chair",
        type: "CHAIR",
        tier: 2,
        bonus: { stat: "clutch", value: 2 },
        weeklyCost: 80,
        purchasedWeek: 0,
      },
      {
        id: "headset_1",
        name: "Pro Tournament Headset",
        type: "HEADSET",
        tier: 3,
        bonus: { stat: "tactic", value: 2 },
        weeklyCost: 60,
        purchasedWeek: 0,
      },
    ]
  }

  /**
   * Generate a comprehensive tournament schedule with Majors, Minors, and Seasonal events
   */
  static generateExpandedTournaments(teams: Team[], selectedRegions: string[] = ["EU", "NA"]): Tournament[] {
    const tournaments: Tournament[] = []
    const currentYear = new Date().getFullYear()

    // Filter teams by selected regions
    const regionTeams = (region: string) => teams.filter(t =>
      t.region === region ||
      (region === "EU" && ["EU", "CIS"].includes(t.region ?? "")) ||
      (region === "NA" && ["NA", "BR"].includes(t.region ?? "")) ||
      (region === "ASIA" && ["ASIA", "OCE"].includes(t.region ?? ""))
    )

    // === MAJOR TOURNAMENTS (S-Tier - Global) ===
    const majorTournaments = [
      { name: "Winter Open Katova Major", startWeek: 8, tier: "s" as const, prizePool: 1250000 },
      { name: "Premier Copenhagen Major", startWeek: 24, tier: "s" as const, prizePool: 1250000 },
      { name: "Global One Colone", startWeek: 32, tier: "s" as const, prizePool: 1000000 },
      { name: "Elite World Final", startWeek: 48, tier: "s" as const, prizePool: 1000000 },
    ]

    majorTournaments.forEach(major => {
      // Top 16 teams globally for Majors
      const topTeams = [...teams].sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0)).slice(0, 16)
      if (topTeams.length >= 8) {
        tournaments.push({
          id: `major_${major.name.toLowerCase().replace(/\s+/g, "_")}_${currentYear}`,
          name: major.name,
          tier: major.tier,
          prizePool: major.prizePool,
          teams: topTeams,
          format: "bracket",
          currentStage: "Group Stage",
          startWeek: major.startWeek,
          endWeek: major.startWeek + 2,
          standings: topTeams.map(team => ({
            team,
            played: 0,
            wins: 0,
            losses: 0,
            points: 0,
            mapDiff: 0,
          })),
        })
      }
    })

    // === A-TIER TOURNAMENTS (Regional) ===
    const aTierEvents = [
      { name: "Global Pro League", region: "EU", startWeek: 4, prizePool: 750000 },
      { name: "Dallas Masters", region: "NA", startWeek: 16, prizePool: 500000 },
      { name: "Elite Circuit Spring", region: "EU", startWeek: 12, prizePool: 425000 },
      { name: "Elite Circuit Fall", region: "EU", startWeek: 36, prizePool: 425000 },
      { name: "Perfect Realm Shanghai", region: "ASIA", startWeek: 28, prizePool: 400000 },
    ]

    aTierEvents.forEach(event => {
      if (selectedRegions.includes(event.region)) {
        const eventTeams = regionTeams(event.region).slice(0, 12)
        if (eventTeams.length >= 6) {
          tournaments.push({
            id: `atier_${event.name.toLowerCase().replace(/\s+/g, "_")}_${currentYear}`,
            name: event.name,
            tier: "a",
            prizePool: event.prizePool,
            teams: eventTeams,
            format: "swiss",
            currentStage: "Group Stage",
            startWeek: event.startWeek,
            endWeek: event.startWeek + 2,
            standings: eventTeams.map(team => ({
              team,
              played: 0,
              wins: 0,
              losses: 0,
              points: 0,
              mapDiff: 0,
            })),
          })
        }
      }
    })

    // === B-TIER TOURNAMENTS (Regional Minors) ===
    const bTierEvents = [
      { name: "CCT Online Finals EU", region: "EU", startWeek: 6, prizePool: 150000 },
      { name: "CCT Online Finals NA", region: "NA", startWeek: 10, prizePool: 150000 },
      { name: "European Open Cup", region: "EU", startWeek: 20, prizePool: 100000 },
      { name: "NA Premier League", region: "NA", startWeek: 22, prizePool: 100000 },
      { name: "Asia Championship", region: "ASIA", startWeek: 18, prizePool: 80000 },
      { name: "Gamers Club Cup", region: "SA", startWeek: 14, prizePool: 60000 },
      { name: "Oceanic Masters", region: "OCE", startWeek: 26, prizePool: 40000 },
    ]

    bTierEvents.forEach(event => {
      if (selectedRegions.includes(event.region)) {
        const eventTeams = regionTeams(event.region).slice(0, 8)
        if (eventTeams.length >= 4) {
          tournaments.push({
            id: `btier_${event.name.toLowerCase().replace(/\s+/g, "_")}_${currentYear}`,
            name: event.name,
            tier: "b",
            prizePool: event.prizePool,
            teams: eventTeams,
            format: "league",
            currentStage: "League Play",
            startWeek: event.startWeek,
            endWeek: event.startWeek + 3,
            standings: eventTeams.map(team => ({
              team,
              played: 0,
              wins: 0,
              losses: 0,
              points: 0,
              mapDiff: 0,
            })),
          })
        }
      }
    })

    // === SEASONAL CUPS (C-Tier) ===
    const seasonalCups = [
      { name: "Spring Showdown", startWeek: 10, region: "EU" },
      { name: "Summer Slam", startWeek: 26, region: "EU" },
      { name: "Fall Frenzy", startWeek: 38, region: "EU" },
      { name: "Winter Warfare", startWeek: 50, region: "EU" },
      { name: "NA Spring Cup", startWeek: 12, region: "NA" },
      { name: "NA Summer Cup", startWeek: 28, region: "NA" },
    ]

    seasonalCups.forEach(cup => {
      if (selectedRegions.includes(cup.region)) {
        const cupTeams = regionTeams(cup.region).slice(0, 8)
        if (cupTeams.length >= 4) {
          tournaments.push({
            id: `seasonal_${cup.name.toLowerCase().replace(/\s+/g, "_")}_${currentYear}`,
            name: cup.name,
            tier: "c",
            prizePool: 25000,
            teams: cupTeams,
            format: "league",
            currentStage: "Qualifiers",
            startWeek: cup.startWeek,
            endWeek: cup.startWeek + 2,
            standings: cupTeams.map(team => ({
              team,
              played: 0,
              wins: 0,
              losses: 0,
              points: 0,
              mapDiff: 0,
            })),
          })
        }
      }
    })

    return tournaments
  }

  static generateInitialGameState(selectedTier: "top" | "mid" | "lower" = "mid", selectedRegions: string[] = ["EU", "NA"]) {
    // Generate player's team
    const playerTeam = this.generateTeam("Your Team", selectedTier, "EU")

    // Generate other teams with regional distribution
    const otherTeams: Team[] = []

    // EU teams (always included as base)
    for (let i = 0; i < 6; i++) {
      otherTeams.push(this.generateTeam(undefined, i < 2 ? "top" : i < 4 ? "mid" : "lower", "EU"))
    }

    // Regional teams based on selection
    if (selectedRegions.includes("NA")) {
      for (let i = 0; i < 4; i++) {
        otherTeams.push(this.generateTeam(undefined, i < 1 ? "top" : i < 2 ? "mid" : "lower", "NA"))
      }
    }
    if (selectedRegions.includes("ASIA")) {
      for (let i = 0; i < 3; i++) {
        otherTeams.push(this.generateTeam(undefined, i < 1 ? "mid" : "lower", "ASIA"))
      }
    }
    if (selectedRegions.includes("SA")) {
      for (let i = 0; i < 3; i++) {
        otherTeams.push(this.generateTeam(undefined, i < 1 ? "mid" : "lower", "BR"))
      }
    }
    if (selectedRegions.includes("OCE")) {
      for (let i = 0; i < 2; i++) {
        otherTeams.push(this.generateTeam(undefined, "lower", "OCE"))
      }
    }

    const allTeams = [playerTeam, ...otherTeams]

    // Generate expanded tournaments
    const tournaments = this.generateExpandedTournaments(allTeams, selectedRegions)

    // Generate match schedule for first tournament
    const schedule = tournaments.length > 0
      ? this.generateSchedule(tournaments[0], new Date("2025-02-01"))
      : []

    // Generate available equipment
    const availableEquipment = this.generateEquipmentItems()

    // Generate scouting pool (all players from other teams)
    const scoutedPlayers = otherTeams.flatMap((team) => team.roster)

    return {
      playerTeam,
      allTeams,
      tournaments,
      schedule,
      availableEquipment,
      scoutedPlayers,
      currentDate: new Date("2025-01-15"),
      currentWeek: 1,
    }
  }
}
