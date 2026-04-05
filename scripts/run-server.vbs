' ============================================================
' HIS REPORT SERVER - TOGGLE START/STOP (RUN HIDDEN)
' Double click:
'   - chưa chạy  -> START
'   - đang chạy  -> STOP
' ============================================================

Option Explicit

Dim sh, exec, line
Dim backendPort, frontendPort
Dim backendPID, frontendPID
Dim scriptDir, backendDir, frontendDir
Dim npmPath

Set sh = CreateObject("WScript.Shell")

backendPort = "5000"
frontendPort = "5173"

npmPath = """C:\Program Files\nodejs\npm.cmd"""

' ===== Lấy thư mục hiện tại =====
scriptDir = CreateObject("Scripting.FileSystemObject") _
            .GetParentFolderName(WScript.ScriptFullName)

backendDir = scriptDir & "\..\backend"
frontendDir = scriptDir & "\..\frontend"

' ============================================================
' FUNCTION: GET PID FROM PORT
' ============================================================
Function GetPID(port)
    Dim cmd, result
    cmd = "cmd /c netstat -ano | findstr :" & port & " | findstr LISTENING"
    Set exec = sh.Exec(cmd)

    GetPID = ""

    Do While Not exec.StdOut.AtEndOfStream
        line = exec.StdOut.ReadLine
        If Trim(line) <> "" Then
            result = Split(line)
            GetPID = result(UBound(result))
            Exit Function
        End If
    Loop
End Function

backendPID = GetPID(backendPort)
frontendPID = GetPID(frontendPort)

' ============================================================
' IF RUNNING → STOP
' ============================================================
If backendPID <> "" Or frontendPID <> "" Then

    If backendPID <> "" Then
        sh.Run "cmd /c taskkill /PID " & backendPID & " /F", 0, True
    End If

    If frontendPID <> "" Then
        sh.Run "cmd /c taskkill /PID " & frontendPID & " /F", 0, True
    End If

    MsgBox "HIS Server da dung.", 64, "STOPPED"
    WScript.Quit
End If


' ============================================================
' START BACKEND (HIDDEN)
' ============================================================
Dim cmdBackend
cmdBackend = "cmd /c cd /d """ & backendDir & """ && " & npmPath & " run dev"

sh.Run cmdBackend, 0, False


' ============================================================
' START FRONTEND (HIDDEN)
' ============================================================
Dim cmdFrontend
cmdFrontend = "cmd /c cd /d """ & frontendDir & """ && " & npmPath & " run dev"

sh.Run cmdFrontend, 0, False


MsgBox "HIS Server da khoi dong NGAM.", 64, "STARTED"

Set sh = Nothing