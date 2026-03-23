; Esports Manager Simulator Launcher
; This script silently launches the game engine and Electron

#NoEnv
#SingleInstance Force
SetWorkingDir %A_ScriptDir%

; Hide the console window
DetectHiddenWindows, On

; Set paths
gamePath := A_ScriptDir . "\game"
runtimePath := A_ScriptDir . "\runtime"
nodePath := runtimePath . "\node.exe"

; Check if node exists
if !FileExist(nodePath) {
    MsgBox, 16, Error, Game runtime not found!`n`nPlease verify game files through Steam.
    ExitApp
}

; Start Next.js dev server in background
SetWorkingDir, %gamePath%
Run, %nodePath% node_modules\next\dist\bin\next start, %gamePath%, Hide, nextPID

; Wait for server to be ready (port 3000)
Loop, 60 {
    try {
        whr := ComObjCreate("WinHttp.WinHttpRequest.5.1")
        whr.Open("GET", "http://localhost:3000/main-menu", false)
        whr.Send()
        if (whr.Status = 200) {
            break
        }
    }
    Sleep, 1000
}

; Launch Electron
electronPath := gamePath . "\node_modules\electron\dist\electron.exe"
if FileExist(electronPath) {
    Run, %electronPath% ., %gamePath%,, electronPID
} else {
    ; Fallback to CLI
    Run, %nodePath% node_modules\electron\cli.js ., %gamePath%,, electronPID
}

; Wait for Electron to close
Process, WaitClose, %electronPID%

; Cleanup: Kill node processes spawned by this launcher
Process, Close, %nextPID%

ExitApp
