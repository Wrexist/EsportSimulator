# Fresh-player first-session observation protocol (L22.4 / L22.A1)

Status: **ready to run. No participants have been tested.** This is a script and set of templates. It is not usability evidence. Record actual sessions before changing any L22 checkbox.

This replaces the earlier draft in [evidence/L22-PLAYER-TEST-PROTOCOL.md](evidence/L22-PLAYER-TEST-PROTOCOL.md). It follows the five-step first-session checklist shipped on `claude/onboarding-first-session`.

## 1. What is being tested

The first-session objective, as it appears in the in-game checklist on Home:

| # | Step | Completes when (in code) |
|---|------|--------------------------|
| 1 | Assess your squad | The player presses **Done assessing squad** on the Squad page |
| 2 | Check what you can afford | The player presses **Done checking finances** on the Finances page |
| 3 | Make one training or recruitment decision | The player picks a weekly focus on Home, sets a player's training focus on Training, or signs a player |
| 4 | Play your first match | A played own-team result exists (a forfeit does not count) |
| 5 | Advance to next week | The career week moves past the week the guide started in |

**Primary objective (pass/fail per participant):** reach step 5 within 30 minutes of pressing New Career on the main menu, without facilitator rescue. Skipping the guide is allowed. Participants who skip still pass if they do steps 3 to 5 (a decision, a played match, a week advance). Winning the match is not required.

**Gate (L22.A1):** at least 10 of 12 fresh participants pass. Report the actual numerator and denominator. Withdrawals and crashes count as failures.

## 2. Cohort and setup

1. Recruit 12 people who have never played this game. Aim for about half who are new to management games and half who have played one (for example Football Manager). Record only an anonymous ID (P01 to P12) and their self-reported familiarity (none / some / a lot).
2. Use one candidate build for the whole cohort. Record the build ID, OS scaling, resolution and input (mouse+keyboard or keyboard only).
3. Give each participant a fresh Windows profile or a clean app-data folder: no existing careers, no setup draft, default settings ("Show Tutorial on New Game" on, sandbox off).
4. Start on the main menu with the window maximised. Start screen recording only if the participant agreed to it separately.
5. Never use the owner's careers or map drafts.

## 3. Facilitator script (read word for word)

> "Thanks for helping. We're testing the game, not you. Please start a new career and play until you've finished your first in-game week. Choose whatever you like. Think aloud: tell us what you're looking at and what you're trying to do. I can't answer questions about the game while you play. If you get stuck, say so, and tell us what you expected to happen."

When asked a question during the primary attempt, the only allowed answer is:

> "What would you try next if I weren't here?"

**Rescue.** Any facilitator action that enables progress fails the no-rescue criterion. Examples: pointing at a control, naming a menu, explaining a rule, or fixing a stuck state. Write down the exact rescue and the time. Then you may continue the session to collect more observations, but the participant cannot pass.

## 4. Tasks and what to time

Start the stopwatch when the participant first sees the main menu. Write down the elapsed time (mm:ss) at each event. Leave a cell blank if it never happened.

| ID | Event | Definition |
|----|-------|------------|
| T1 | Setup started | Clicks New Career (or equivalent) |
| T2 | Club committed | The career is created (Home loads, or the roster builder opens for a custom club) |
| T3 | First meaningful decision | **Time-to-first-meaningful-decision (TTFMD).** The first deliberate choice of a weekly focus, a training focus or a signing. If you ask "why that one?" afterwards, the participant gives a reason about cost, training, energy or roster need. Opening a page or dismissing text does not count |
| T4 | Squad assessed | Checklist step 1 ticks, or for participants who skipped: says aloud what the squad's strength or weakness is |
| T5 | Budget understood | Checklist step 2 ticks, or for skippers: says roughly how much cash they have and what it pays for |
| T6 | Match started | Enters tactics, live match or quick sim for their own fixture |
| T7 | Match finished | The result is saved (result screen is shown) |
| T8 | Week advanced | The week number in the top bar increases |
| T9 | Guide skipped | If they pressed Skip guide, the time and what they said |

**Primary success:** T8 ≤ 30:00, no rescue, and a T3 with a stated reason.

**Secondary measures (reported, not part of the gate):**
- TTFMD (T3 − T2). Report the median, the minimum, the maximum and every individual value. Do not report only the average.
- Club choice time (T2 − T1).
- How many participants skipped the guide, and when.
- Wrong turns: navigations away from the current checklist step that were not needed for it.
- Dead clicks: clicks on things that are not interactive, or controls that did nothing visible.

## 5. Post-session questions (after the primary attempt only)

Ask these in order. Do not correct answers until they are recorded.

1. "What does your cash balance need to cover each week?"
2. "Why did you pick that club?" Then: "Did the game tell you what the board expects? What was it?"
3. "What did your training or recruitment choice change, and when will it apply?"
4. "What would you do next week, and why?"
5. "Was the checklist on Home helpful, in the way, or not noticed?" (1 to 5, plus one sentence)
6. "Was there a point where you didn't know what to do next?"

## 6. Assisted checks (separate, do not count toward the gate)

Run these after the primary attempt with 2 or 3 participants. Each one is pass/fail with notes.

| Check | Steps | Expected |
|-------|-------|----------|
| A1 Skip and replay | Skip guide → Settings → Replay Tutorial Guide → Home | Checklist is back at 0/5; cash, squad, results and week are unchanged |
| A2 Replay needs new actions | After A1, look at the checklist without doing anything | No step ticks itself from earlier history |
| A3 Save/reload midway | Do steps 1 and 2 → quit to the main menu → Continue | Checklist still shows 2/5 |
| A4 Abandoned stock-club setup | Enter a name, pick a club, close the window before Start Career, then reopen | No career was created; New Career restores the name and the selected club |
| A5 Abandoned custom setup | Close the window at the roster builder, then reopen and Continue | The career loads with an empty or partial roster. The checklist says how many players are missing and links to Transfers |
| A6 Eligibility | With sandbox off, try to pick a locked club | The card explains the level needed and that sandbox unlocks it. Start Career stays disabled |
| A7 Keyboard only | Do steps 1 to 3 with the keyboard only | Every checklist control can be reached and has a visible focus ring |

## 7. Session record template

Copy one row per participant into [evidence/L22-player-sessions.csv](evidence/L22-player-sessions.csv), or a new CSV with these columns:

```
participant_id,date,build_id,resolution,scaling,input,familiarity,club,custom_club(y/n),starting_cash,starters_at_start,
T1,T2,T3,T4,T5,T6,T7,T8,T9,ttfmd_seconds,decision_type(focus/training/signing),decision_reason_given(y/n),
skipped_guide(y/n),rescued(y/n),rescue_note,passed(y/n),wrong_turns,dead_clicks,checklist_rating_1to5,notes
```

## 8. Confusion log template

Log every hesitation over 10 seconds, every question aloud, every wrong turn and every dead click. One line per incident:

| Participant | Time | Route / screen | Checklist step shown | What they said or did (verbatim if possible) | What they expected | Severity (blocker / slowed / cosmetic) | Rescued? |
|---|---|---|---|---|---|---|---|
| P01 | 04:12 | /finances | 2 Check what you can afford | "Where do I see wages?" scrolled up and down twice | wages next to the cash figure | slowed | no |

At the end of the cohort, group incidents by screen and step. List the three most common confusions and how many participants hit each one.

## 9. Reporting and decision rule

Write the results into `docs/launch-readiness/evidence/L22-REPORT.md`:

1. The pass count as **N of 12**, with every withdrawal, crash or rescue listed by participant ID.
2. TTFMD for every participant (median, minimum, maximum) and the club-choice times.
3. The top three confusions with counts, and the planned fix for each.
4. Assisted-check results A1 to A7.
5. The build ID and when the sessions ran.

L22.A1 passes only if 10 or more of 12 pass. If it fails, fix the blockers and run a **new** cohort; do not retest the same people. A passing cohort does not clear L22.A2/A3 or any packaged-Windows, content or economy gates on its own.
