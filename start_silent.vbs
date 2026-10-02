Dim WshShell, fso, startupFolder, logFile
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Path to project
Dim projectPath
projectPath = "d:\Works\thesiss\kesorn"

' Run node directly without showing any console window (0 = hide window)
WshShell.CurrentDirectory = projectPath
WshShell.Run "node node_modules\next\dist\bin\next start -p 3001 -H 0.0.0.0", 0, False
