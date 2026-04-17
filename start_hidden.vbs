' start_hidden.vbs — launch a command in a completely hidden cmd window
' Usage: cscript //nologo start_hidden.vbs "workdir" "command"
Set args = WScript.Arguments
If args.Count < 2 Then
    WScript.Echo "Usage: start_hidden.vbs workdir command"
    WScript.Quit 1
End If

workdir = args(0)
cmd = args(1)

Set ws = CreateObject("WScript.Shell")
ws.Run "cmd /c ""cd /d """ & workdir & """ && " & cmd & """", 0, False
