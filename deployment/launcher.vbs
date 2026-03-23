' Esports Manager Simulator Launcher
' This VBScript launches the game without showing a command window

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Path to the internal batch launcher
batchPath = scriptPath & "\launcher_internal.bat"

' Run the batch file hidden (0 = hidden window)
WshShell.Run """" & batchPath & """", 0, True
