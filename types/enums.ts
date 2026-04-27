/**
 * Core enums for the Tactical FPS Esports Manager Simulation.
 * Phase 3: Strict, gameplay-meaningful type definitions.
 */

/**
 * Supported games in the simulation.
 */
export enum GameId {
  TACTICAL_FPS = "Tactical FPS"
}

/**
 * Player roles in a 5v5 tactical shooter.
 * - SNIPER: Long-range specialist with the team's heavy sniper rifle.
 * - RIFLER: Versatile rifle player.
 * - IGL: In-Game Leader, calls strategies.
 * - SUPPORT: Utility-focused, enables teammates.
 * - ENTRY_FRAGGER: First through the door, opens up sites.
 *
 * Note: AWPER is retained as an alias for legacy compatibility with saves.
 */
export enum PlayerRole {
  AWPER = "AWPER",
  RIFLER = "RIFLER",
  IGL = "IGL",
  SUPPORT = "SUPPORT",
  ENTRY_FRAGGER = "ENTRY_FRAGGER"
}

/**
 * Player tier classification.
 * Affects salary expectations, transfer value, and tournament eligibility.
 */
export enum PlayerTier {
  ELITE = "ELITE",       // Top 50 players globally
  PRO = "PRO",           // Professional tier-1 players
  SEMI_PRO = "SEMI_PRO", // Tier-2/3 professional players
  ACADEMY = "ACADEMY"    // Academy/amateur players
}

/**
 * Match format (Best of X)
 */
export enum MatchFormat {
  BO1 = "BO1",
  BO3 = "BO3",
  BO5 = "BO5"
}

/**
 * Active competitive map pool (fictional).
 *
 * Enum keys are kept stable for code/IO compatibility, but display values
 * use fictional map names so the shipped build does not reference any
 * third-party map trademarks.
 */
export enum MapId {
  DUST2 = "Outpost",
  MIRAGE = "Citadel",
  INFERNO = "Refinery",
  NUKE = "Reactor",
  OVERPASS = "Junction",
  VERTIGO = "Skyline",
  ANCIENT = "Ruins",
  ANUBIS = "Temple"
}

/**
 * Event types that can occur during simulation
 */
export enum EventType {
  MORALE = "MORALE",       // Player morale changes
  FINANCE = "FINANCE",     // Financial events (sponsor offers, etc.)
  INJURY = "INJURY",       // Player injuries
  CONTRACT = "CONTRACT",   // Contract negotiations/expirations
  MEDIA = "MEDIA",          // Media/PR events
  FAN = "FAN",              // Fan interactions
  SPONSOR = "SPONSOR",      // Sponsor meetings
  RETIREMENT = "RETIREMENT", // Player retirements
  TRANSFER_OFFER = "TRANSFER_OFFER", // Offers from other teams
  JOB_OFFER = "JOB_OFFER"   // Job offers for manager to switch teams
}

/**
 * Training session focus areas
 */
export enum TrainingFocus {
  AIM = "AIM",           // Improves mechanical skills (aim, reaction)
  TACTICS = "TACTICS",   // Improves tactical understanding
  TEAMPLAY = "TEAMPLAY", // Improves teamwork and chemistry
  REST = "REST"          // Reduces fatigue, prevents burnout
}

/**
 * Equipment slots for player gear
 */
export enum EquipmentSlot {
  MOUSE = "MOUSE",
  KEYBOARD = "KEYBOARD",
  MONITOR = "MONITOR",
  CHAIR = "CHAIR",
  HEADSET = "HEADSET"
}

/**
 * Staff member types
 */
export enum StaffType {
  COACH = "COACH",
  ANALYST = "ANALYST",
  PSYCHOLOGIST = "PSYCHOLOGIST",
  SCOUT = "SCOUT"
}

/**
 * Tournament tier classification
 */
export enum TournamentTier {
  S = "S", // Major championships
  A = "A", // Premier tournaments
  B = "B", // Regional championships
  C = "C"  // Minor/qualifier tournaments
}

/**
 * Tournament format types
 */
export enum TournamentFormat {
  BRACKET = "BRACKET",     // Single/double elimination
  LEAGUE = "LEAGUE",       // Round-robin league
  SWISS = "SWISS"          // Swiss system
}
