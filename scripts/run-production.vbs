' ============================================================
' HIS REPORT SERVER - PRODUCTION START/STOP (RUN HIDDEN)
' Double click:
'   - chưa chạy  -> START PRODUCTION (Port 5000 serves both Backend & Frontend)
'   - đang chạy  -> STOP
' ============================================================

Option Explicit

Dim sh, exec, line
Dim backendPort
Dim backendPID
Dim scriptDir, backendDir
Dim npmPath

Set sh = CreateObject("WScript.Shell")

backendPort = "5000"
npmPath = "npm"

' ===== Lấy thư mục hiện tại =====
scriptDir = CreateObject("Scripting.FileSystemObject") _
            .GetParentFolderName(WScript.ScriptFullName)

backendDir = scriptDir & "\..\backend"

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

' ============================================================
' IF RUNNING → STOP
' ============================================================
If backendPID <> "" Then
    sh.Run "cmd /c taskkill /PID " & backendPID & " /F", 0, True
    MsgBox "HIS Server (Production) da dung.", 64, "STOPPED"
    WScript.Quit
End If

' ============================================================
' START BACKEND PRODUCTION (HIDDEN)
' ============================================================
Dim cmdBackend
cmdBackend = "cmd /c cd /d """ & backendDir & """ && " & npmPath & " run start"

sh.Run cmdBackend, 0, False

MsgBox "HIS Server (Production) da khoi dong NGAM tai cong " & backendPort & "." & vbCrLf & _
       "Duong dan truy cap: http://localhost:" & backendPort, 64, "STARTED (PRODUCTION)"

Set sh = Nothing
