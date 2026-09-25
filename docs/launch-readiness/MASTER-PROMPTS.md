# Master prompts: Windows 1.0

36 bounded execution prompts. Open one linked file and use its full prompt; each includes shared rules, scope, entry points, dependencies and acceptance criteria. Start with L01/L02/L34, then follow the critical paths in [the launch plan](README.md). Do not paste all 36 as one undifferentiated rewrite request.

## Continue the next eligible package

```text
Read docs/launch-readiness/README.md and backlog.json. Select the highest-priority incomplete required package whose acceptance dependencies are satisfied, or advance independent preparation in an urgent blocked package. Read its file in docs/launch-readiness/prompts. Reverify the finding, implement the bounded work, run its checks, preserve user data, and update the evidence and status. Explain the chosen package first. Do not substitute another planning document for requested implementation, or mark unverified work complete. Respect existing user authorization and do not publish/release without it.
```

## Package index

| ID | Master prompt | Current state | Dependencies |
|---|---|---|---|
| L01 | [Define the launch promise and management identity](prompts/L01.md) | open; required | None |
| L02 | [Create reproducible careers and evidence fixtures](prompts/L02.md) | partial; required | L01 |
| L03 | [Finish save, migration and recovery trust](prompts/L03.md) | partial; required | L02 |
| L04 | [Prove deterministic simulation and worker ownership](prompts/L04.md) | partial; required | L02, L03 |
| L05 | [Complete preferences, audio, exit and desktop lifecycle](prompts/L05.md) | partial; required | L03, L04 |
| L06 | [Resolve dependency and runtime security findings](prompts/L06.md) | failed; required | L02 |
| L07 | [Harden Electron, IPC and local boundaries](prompts/L07.md) | partial; required | L06 |
| L08 | [Establish content provenance and distribution rights](prompts/L08.md) | unverified; required | L01 |
| L09 | [Register map annotations, spawns and plant zones](prompts/L09.md) | partial; required | L02, L08 |
| L10 | [Implement credible movement and vertical traversal](prompts/L10.md) | partial; required | L04, L09 |
| L11 | [Make perception and shots cause encounter outcomes](prompts/L11.md) | open; required | L04, L10 |
| L12 | [Simulate utility, cover and dynamic obstacles](prompts/L12.md) | open; required | L10, L11 |
| L13 | [Build tactically intelligent teams](prompts/L13.md) | open; required | L11, L12 |
| L14 | [Connect the spatial engine to authoritative matches](prompts/L14.md) | open; required | L03, L04, L13 |
| L15 | [Unify finances, budgets and contract consequences](prompts/L15.md) | partial; required | L03, L04 |
| L16 | [Finish squad, recruitment, scouting and transfer AI](prompts/L16.md) | partial; required | L04, L15 |
| L17 | [Make development, training and academy choices matter](prompts/L17.md) | partial; required | L04, L16 |
| L18 | [Give staff, sponsors, facilities and equipment clear value](prompts/L18.md) | partial; required | L15, L17 |
| L19 | [Validate calendar, tournaments, qualification and rankings](prompts/L19.md) | partial; required | L04, L15 |
| L20 | [Make long careers coherent and memorable](prompts/L20.md) | partial; required | L16, L17, L18, L19 |
| L21 | [Make match management offer real agency](prompts/L21.md) | partial; required | L14, L16, L19 |
| L22 | [Rebuild onboarding and the first session](prompts/L22.md) | partial; required | L01, L16, L17, L21 |
| L23 | [Apply one polished interface across all routes](prompts/L23.md) | partial; required | L05, L22 |
| L24 | [Finish accessibility, input and localization readiness](prompts/L24.md) | partial; required | L23 |
| L25 | [Complete original team identities and asset delivery](prompts/L25.md) | partial; required | L08, L23 |
| L26 | [Edit content, terminology, audio and feedback](prompts/L26.md) | partial; required | L20, L23, L25 |
| L27 | [Measure and improve real performance](prompts/L27.md) | unverified; required | L04, L14, L23 |
| L28 | [Run a management and simulation balance campaign](prompts/L28.md) | unverified; required | L13, L15, L16, L17, L18, L19, L20, L21, L27 |
| L29 | [Finish community imports and optional Workshop](prompts/L29.md) | partial; conditional | L03, L07, L08 |
| L30 | [Validate Steam identity, Cloud, achievements and stats](prompts/L30.md) | unverified; required | L03, L05, L07, L19, L20, L31 |
| L31 | [Produce and test the actual Windows shipping artifact](prompts/L31.md) | failed; required | L03, L05, L06, L07, L08, L25 |
| L32 | [Prepare a truthful Steam store and launch campaign](prompts/L32.md) | unverified; required | L01, L08, L22, L25, L26 |
| L33 | [Run external playtests and the full acceptance matrix](prompts/L33.md) | unverified; required | L22, L24, L26, L27, L28, L31, L30 |
| L34 | [Make release gates reproducible and honest](prompts/L34.md) | partial; required | L02, L06, L07 |
| L35 | [Prepare support, diagnostics and safe updates](prompts/L35.md) | open; required | L03, L30, L31, L34 |
| L36 | [Assemble the release decision and owner handoff](prompts/L36.md) | open; required | L03, L04, L05, L06, L07, L08, L09, L10, L11, L12, L13, L14, L15, L16, L17, L18, L19, L20, L21, L22, L23, L24, L25, L26, L27, L28, L29, L30, L31, L32, L33, L34, L35 |

