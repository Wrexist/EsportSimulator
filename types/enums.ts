/**
 * Core enums for CS2 Esports Manager Simulation
 * Phase 3: Strict, gameplay-meaningful type definitions
 */

/**
 * Supported games in the simulation
 */
export enum GameId {
  CS2 = "CS2"
}

/**
 * Player roles in CS2
 * - AWPER: Primary AWP player, long-range specialist
 * - RIFLER: Versatile rifle player
 * - IGL: In-Game Leader, calls strategies
 * - SUPPORT: Utility-focused, enables teammates
 */
export enum PlayerRole {
  AWPER = "AWPER",
  RIFLER = "RIFLER",
  IGL = "IGL",
  SUPPORT = "SUPPORT",
  ENTRY_FRAGGER = "ENTRY_FRAGGER"
}

/**
 * Player tier classification
 * Affects salary expectations, transfer value, and tournament eligibility
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
 * Official CS2 competitive map pool
 */
export enum MapId {
  DUST2 = "Dust2",
  MIRAGE = "Mirage",
  INFERNO = "Inferno",
  NUKE = "Nuke",
  OVERPASS = "Overpass",
  VERTIGO = "Vertigo",
  ANCIENT = "Ancient",
  ANUBIS = "Anubis"
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
