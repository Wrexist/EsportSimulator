/**
 * Decision deadlines (engine/decision-deadlines.ts): the note every open
 * decision ends with, "If you don't answer by Week 9, the club …". Each
 * consequence completes that sentence with the club as its subject;
 * {{name}} is the player concerned. In a pro career (dl.noteYou) the
 * subject is the player, "you".
 */
export const DEADLINES = {
    "dl.note": "If you don't answer by Week {{week}}, the club {{consequence}}.",
    "dl.noteYou": "If you don't answer by Week {{week}}, you {{consequence}}.",
    "dl.thePlayer": "the player",
    "dl.c.lapse": "lets it lapse",
    "dl.c.goesWith": "goes with “{{choice}}”",
    "dl.c.fan_meet": "skips the meetup and keeps the squad on practice",
    "dl.c.sponsor_review": "sends the standard progress report",
    "dl.c.equipment_deal": "declines the deal",
    "dl.c.media_interview": "declines the interview",
    "dl.c.unhappy_player": "leaves {{name}}'s complaint unanswered",
    "dl.c.birthday": "sends {{name}} its best wishes",
    "dl.c.burnout": "keeps {{name}} on the full training load",
    "dl.c.pro_offer": "stay at your current club",
    "dl.c.pro_retire": "play another season",
    "dl.c.workload": "plays {{name}} at the stated injury risk",
    "dl.c.knock": "rests {{name}} for the stated weeks",
    "dl.c.win_streak": "tells the squad to stay focused",
    "dl.c.losing_run": "issues the standard roster shakeup warning",
    "dl.c.legend_coach": "declines the coaching offer",
    "dl.c.transfer_request": "refuses {{name}}'s transfer request (his morale and loyalty drop)",
    "dl.c.press": "sends no one to the press conference: no effect",
    "dl.c.talk": "holds a private conversation with {{name}}",
    "dl.c.checkIn": "settles for a check-in with {{name}}",
    "dl.c.praise": "praises the captain",
    "dl.c.offerLapse": "lets the offer lapse",
    "dl.c.bidLapse": "lets the bid lapse",
    "dl.c.dropRequest": "drops the request",
} as const
