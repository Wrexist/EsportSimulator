# Esports Manager - Bygg & Publicera till Steam

Denna guide ar skriven for en person som aldrig har kodat men som kan folja instruktioner.

---

## Vad du behover (forsta gangen)

1. **Node.js** installerat (https://nodejs.org - valj LTS-versionen)
2. **steamcmd.exe** nedladdad och utpackad till `C:\steamcmd\` (https://developer.valvesoftware.com/wiki/SteamCMD)
3. Ett Steam-utvecklarkonto med rattigheter till App ID 4326170
4. Alla projektfiler pa din dator (denna mapp)

### Installera beroenden (bara forsta gangen eller efter andring i package.json)

Oppna en terminal (Command Prompt eller PowerShell) i projektmappen och kor:

```
npm install
```

Vanta tills det ar klart. Det kan ta nagra minuter.

---

## Steg 1: Bygg spelet

Oppna en terminal i projektmappen och kor:

```
npm run dist
```

Det har kommandot gor tre saker automatiskt:
1. Rensar gammal build
2. Bygger Next.js (spelets webbgranssnitt)
3. Paketerar allt med Electron (spelets motor)

**Resultat:** En mapp `dist\win-unpacked\` dyker upp med den fardiga spelfilen.

`npm run dist` anvander nu **stabilitetslage** for paketerad start (`ESM_STABILITY_MODE=1` som standard).
Det minskar risken for gra skarm vid uppstart.

For overlay/GPU-diagnostik kan du bygga utan stabilitetslage:
```
cross-env ESM_STABILITY_MODE=0 npm run dist
```

> `npm run electron:build` gor exakt samma sak. Det spelar ingen roll vilken du kor.

**Tidsatgang:** 5-15 minuter beroende pa dator.

**Om det misslyckas:**
- "ENOMEM" eller "heap out of memory" = Stang andra program och forsok igen
- "next build failed" = Kolla att du inte har syntaxfel i koden (kor `npm run type-check` for att se)
- Om nagonting ar konstigt, forsok `npm run clean:all` forst, sen `npm run dist` igen

---

## Steg 2: Testa lokalt

1. Ga till `dist\win-unpacked\`
2. Dubbel-klicka pa **Esports Manager.exe**
3. Spelet ska starta

**Testa specifikt:**
- [ ] Spelet startar och visar huvudmenyn
- [ ] Du kan starta ett nytt spel
- [ ] Alt-Tab fungerar utan att skapa dubbletter
- [ ] Ingen fastnar pa gra skarm vid uppstart
- [ ] Du kan spara och ladda spelet

### Startlogg (viktigt vid gra skarm)

Vid uppstart skriver Electron detaljerad logg till:

`%APPDATA%\esports-manager-sim\logs\startup-debug.log`

Du ska normalt se en rad som liknar:

`[Renderer] Page finished loading: http://localhost:3000/main-menu`

Om den saknas:
- `Renderer boot timeout` = renderer hann inte starta inom 10 sekunder.
- `Page load FAILED: ...` = navigationen till sidan misslyckades.
- `render-process-gone ...` = render-processen kraschade.
- `[Process [GPU]] child-process-gone ...` = GPU-process problem.

---

## Steg 2.5: Verifiera bygget INNAN du laddar upp (VIKTIGT)

Detta steg fangar felet som fick BuildID 23989573 underkant av Steam
(depon saknade `EsportsManager.exe` sa Steam startade `7za.exe` istallet).

Kor:

```
npm run ship:verify
```

- Star det **PASS** = bygget ar ratt, ladda upp.
- Star det **FAIL** = ladda INTE upp. Las felmeddelandet. Vanligaste orsaken
  ar att du kort den gamla `build_release.bat` (portabel `SteamBuild\`) istallet
  for `npm run dist`. Kor `npm run dist` igen.

> `SHIP_GAME.bat` kor detta steg automatiskt at dig.

---

## Steg 3: Ladda upp till Steam

Nar du testat och `npm run ship:verify` sager PASS:

1. Oppna en terminal i projektmappen
2. Kor:

```
deployment\upload_steam.bat
```

3. Skriv in ditt Steam-anvdarnamn nar det fragar
4. Logga in (du kan behova Steam Guard-kod)
5. Vanta tills uppladdningen ar klar

**Alternativt** kan du ladda upp manuellt med steamcmd:

```
C:\steamcmd\steamcmd.exe +login DITT_ANVÄNDARNAMN +run_app_build "FULL_SÖKVÄG\deployment\config\app_build_4326170.vdf" +quit
```

---

## Steg 4: Satt live pa Steam

1. Ga till https://partner.steamgames.com
2. Logga in
3. Ga till din app (4326170)
4. Under **SteamPipe** > **Builds**, hitta din senaste build
5. Klicka **Set build live** och valj branch (vanligtvis "default" for main release)
6. Vanta 5-10 minuter - sedan ar uppdateringen live for alla spelare

---

## Steg 5: Kontrollera Launch Option (bara forsta gangen / om den ar fel)

Steam maste veta vilken fil som startar spelet. Den ska peka pa `EsportsManager.exe`.

1. Ga till https://partner.steamgames.com > din app (4326170)
2. **Installation** > **Installation configuration** (App Data Admin)
3. Under **Launch Options**, satt:
   - **Executable:** `EsportsManager.exe`
   - **Operating System:** Windows
   - **(lamna Arguments och Working Directory tomma)**
4. Spara och publicera andringen (den maste publiceras separat fran bygget).

> Om launch option pekar pa nagot annat (t.ex. den gamla `.bat`-filen eller
> `7za.exe`) kommer Steam att underkanna bygget. `EsportsManager.exe` ligger
> i roten av depon nar du bygger med `npm run dist`.

---

## Snabb-referens

| Vad du vill gora              | Kommando                     |
|-------------------------------|------------------------------|
| Bygga spelet                  | `npm run dist`               |
| Verifiera bygget fore upload  | `npm run ship:verify`        |
| Ladda upp till Steam          | `deployment\upload_steam.bat`|
| Testa i dev-lage (snabbare)   | `npm run electron:dev`       |
| Kolla efter kodfel            | `npm run type-check`         |
| Kora tester                   | `npm run test`               |
| Rensa allt och borja om       | `npm run clean:all`          |

---

## Viktigt att veta

- **Rora INTE** filer i `electron/`-mappen om du inte vet vad du gor - det ar spelets motor
- **`dist/`-mappen** skapas automatiskt av `npm run dist`. Du behover inte skapa den manuellt
- **`SteamBuild/`-mappen** ar en GAMMAL, UTFASAD pipeline (portabel Node-kopia).
  Ladda ALDRIG upp den till Steam - den saknar `EsportsManager.exe` och far bygget
  underkant. Ta garna bort mappen helt. Ship alltid via `npm run dist` /
  `SHIP_GAME.bat` (electron-builder -> `dist\win-unpacked\EsportsManager.exe`)
- **`steam_appid.txt`** maste finnas och innehalla exakt `4326170` (inget mellanslag eller ny rad efter)
- Alla anderingar i koden maste byggas om (`npm run dist`) innan de syns i spelet
