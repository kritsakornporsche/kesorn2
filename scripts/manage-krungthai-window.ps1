param(
    [string]$Action = "status"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class LineWindowManager {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, int dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll")]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpfn, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr", CharSet = CharSet.Auto)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong", CharSet = CharSet.Auto)]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    public static long GetWindowLongPtr(IntPtr hWnd, int nIndex) {
        if (IntPtr.Size == 8) return (long)GetWindowLongPtr64(hWnd, nIndex);
        return (long)GetWindowLong32(hWnd, nIndex);
    }

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr", CharSet = CharSet.Auto)]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong", CharSet = CharSet.Auto)]
    private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

    public static long SetWindowLongPtr(IntPtr hWnd, int nIndex, long dwNewLong) {
        if (IntPtr.Size == 8) return (long)SetWindowLongPtr64(hWnd, nIndex, (IntPtr)dwNewLong);
        return (long)SetWindowLong32(hWnd, nIndex, (int)dwNewLong);
    }

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern IntPtr GetSystemMenu(IntPtr hWnd, bool bRevert);

    [DllImport("user32.dll")]
    public static extern bool DeleteMenu(IntPtr hMenu, uint uPosition, uint uFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    public const int GWL_STYLE = -16;
    public const long WS_MINIMIZEBOX = 0x00020000L;
    public const uint SC_MINIMIZE = 0xF020;
    public const uint MF_BYCOMMAND = 0x00000000;

    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);

    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_FRAMECHANGED = 0x0020;
    public const uint SWP_SHOWWINDOW = 0x0040;
    public const int SW_RESTORE = 9;
    public const int SW_SHOW = 5;

    const uint KEYEVENTF_KEYUP = 0x0002;
    const byte VK_CONTROL = 0x11;
    const byte VK_F = 0x46;
    const byte VK_V = 0x56;
    const byte VK_RETURN = 0x0D;
    const byte VK_1 = 0x31;

    public static void PressKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        Thread.Sleep(50);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(50);
    }

    public static void SendCtrlKey(byte vk) {
        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        Thread.Sleep(50);
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        Thread.Sleep(50);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(50);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(100);
    }

    public static void OpenKrungthaiChat(IntPtr hWnd) {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);

        ShowWindowAsync(hWnd, SW_RESTORE);
        ShowWindow(hWnd, SW_RESTORE);
        SwitchToThisWindow(hWnd, true);
        SetForegroundWindow(hWnd);
        Thread.Sleep(400);

        // Switch to chats: Ctrl+1
        SendCtrlKey(VK_1);
        Thread.Sleep(250);

        // Focus search bar: Ctrl+F
        SendCtrlKey(VK_F);
        Thread.Sleep(350);

        // Paste search query: Ctrl+V (clipboard must already be set)
        SendCtrlKey(VK_V);
        Thread.Sleep(700);

        // Press Enter to open chat
        PressKey(VK_RETURN);
        Thread.Sleep(600);
    }

    public static List<IntPtr> FindLineWindows(int[] pids, out List<string> titles) {
        var windows = new List<IntPtr>();
        var titleList = new List<string>();
        var pidSet = new HashSet<uint>();
        foreach (var p in pids) pidSet.Add((uint)p);

        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        if (hDesk != IntPtr.Zero) {
            SetThreadDesktop(hDesk);
        }

        EnumDesktopWindows(hDesk, (hWnd, lParam) => {
            uint pidOut = 0;
            GetWindowThreadProcessId(hWnd, out pidOut);
            if (pidSet.Contains(pidOut)) {
                var sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                string title = sb.ToString();
                if (!string.IsNullOrEmpty(title) && IsWindowVisible(hWnd)) {
                    windows.Add(hWnd);
                    titleList.Add(title);
                }
            }
            return true;
        }, IntPtr.Zero);

        titles = titleList;
        return windows;
    }
}
"@

$lineProcs = Get-Process -Name "LINE" -ErrorAction SilentlyContinue

if (-not $lineProcs) {
    if ($Action -eq "launch" -or $Action -eq "lock") {
        $launcherPath = "$env:LOCALAPPDATA\LINE\bin\LineLauncher.exe"
        if (Test-Path $launcherPath) {
            Start-Process -FilePath $launcherPath
            for ($waitIdx = 0; $waitIdx -lt 10; $waitIdx++) {
                Start-Sleep -Milliseconds 500
                $lineProcs = Get-Process -Name "LINE" -ErrorAction SilentlyContinue
                if ($lineProcs) { break }
            }
        }
    }
}

if (-not $lineProcs) {
    $res = @{
        success = $false
        isLineRunning = $false
        found = $false
        error = "LINE_NOT_RUNNING"
    }
    $res | ConvertTo-Json -Compress
    exit 0
}

[int[]]$pids = @($lineProcs | Select-Object -ExpandProperty Id)
$debugTitles = $null
$windows = [LineWindowManager]::FindLineWindows($pids, [ref]$debugTitles)

$targetHwnd = [IntPtr]::Zero
$targetTitle = ""

for ($i = 0; $i -lt $windows.Count; $i++) {
    $t = $debugTitles[$i]
    if ($t.IndexOf("Krungthai", [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $targetHwnd = $windows[$i]
        $targetTitle = $t
        break
    }
}

# If Krungthai chat window is not found yet, and action is lock or launch, automate opening it
if ($targetHwnd -eq [IntPtr]::Zero -and ($Action -eq "lock" -or $Action -eq "launch")) {
    $mainHwnd = [IntPtr]::Zero
    for ($i = 0; $i -lt $windows.Count; $i++) {
        $t = $debugTitles[$i]
        if ($t -eq "LINE") {
            $mainHwnd = $windows[$i]
            break
        }
    }
    if ($mainHwnd -eq [IntPtr]::Zero -and $windows.Count -gt 0) {
        $mainHwnd = $windows[0]
    }

    if ($mainHwnd -ne [IntPtr]::Zero) {
        try {
            Set-Clipboard -Value "Krungthai Connext"
            [LineWindowManager]::OpenKrungthaiChat($mainHwnd)
            Start-Sleep -Milliseconds 600

            # Re-scan for windows
            $windows = [LineWindowManager]::FindLineWindows($pids, [ref]$debugTitles)
            for ($i = 0; $i -lt $windows.Count; $i++) {
                $t = $debugTitles[$i]
                if ($t.IndexOf("Krungthai", [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                    $targetHwnd = $windows[$i]
                    $targetTitle = $t
                    break
                }
            }
            if ($targetHwnd -eq [IntPtr]::Zero) {
                $targetHwnd = $mainHwnd
                $targetTitle = "LINE (Krungthai Connext)"
            }
        } catch {}
    }
}

if ($targetHwnd -eq [IntPtr]::Zero -and $windows.Count -gt 0) {
    for ($i = 0; $i -lt $windows.Count; $i++) {
        $t = $debugTitles[$i]
        if ($t -ne "LINE" -and $t -ne "Notification") {
            $targetHwnd = $windows[$i]
            $targetTitle = $t
            break
        }
    }
    if ($targetHwnd -eq [IntPtr]::Zero) {
        $targetHwnd = $windows[0]
        $targetTitle = $debugTitles[0]
    }
}

if ($targetHwnd -eq [IntPtr]::Zero) {
    $res = @{
        success = $false
        isLineRunning = $true
        found = $false
        error = "WINDOW_NOT_FOUND"
    }
    $res | ConvertTo-Json -Compress
    exit 0
}

$currentStyle = [LineWindowManager]::GetWindowLongPtr($targetHwnd, [LineWindowManager]::GWL_STYLE)
$isMinimizeDisabled = (($currentStyle -band [LineWindowManager]::WS_MINIMIZEBOX) -eq 0)

if ($Action -eq "lock") {
    if ([LineWindowManager]::IsIconic($targetHwnd)) {
        [LineWindowManager]::ShowWindow($targetHwnd, [LineWindowManager]::SW_RESTORE) | Out-Null
    } else {
        [LineWindowManager]::ShowWindow($targetHwnd, [LineWindowManager]::SW_SHOW) | Out-Null
    }

    [LineWindowManager]::SetForegroundWindow($targetHwnd) | Out-Null

    $newStyle = $currentStyle -band (-bnot [LineWindowManager]::WS_MINIMIZEBOX)
    [LineWindowManager]::SetWindowLongPtr($targetHwnd, [LineWindowManager]::GWL_STYLE, $newStyle) | Out-Null

    $hMenu = [LineWindowManager]::GetSystemMenu($targetHwnd, $false)
    if ($hMenu -ne [IntPtr]::Zero) {
        [LineWindowManager]::DeleteMenu($hMenu, [LineWindowManager]::SC_MINIMIZE, [LineWindowManager]::MF_BYCOMMAND) | Out-Null
    }

    $flags = [LineWindowManager]::SWP_NOSIZE -bor [LineWindowManager]::SWP_NOMOVE -bor [LineWindowManager]::SWP_FRAMECHANGED -bor [LineWindowManager]::SWP_SHOWWINDOW
    [LineWindowManager]::SetWindowPos($targetHwnd, [LineWindowManager]::HWND_TOPMOST, 0, 0, 0, 0, $flags) | Out-Null

    $res = @{
        success = $true
        isLineRunning = $true
        found = $true
        targetTitle = $targetTitle
        isLocked = $true
        isTopMost = $true
        action = "locked"
    }
    $res | ConvertTo-Json -Compress
    exit 0
}
elseif ($Action -eq "unlock") {
    $newStyle = $currentStyle -bor [LineWindowManager]::WS_MINIMIZEBOX
    [LineWindowManager]::SetWindowLongPtr($targetHwnd, [LineWindowManager]::GWL_STYLE, $newStyle) | Out-Null

    [LineWindowManager]::GetSystemMenu($targetHwnd, $true) | Out-Null

    $flags = [LineWindowManager]::SWP_NOSIZE -bor [LineWindowManager]::SWP_NOMOVE -bor [LineWindowManager]::SWP_FRAMECHANGED -bor [LineWindowManager]::SWP_SHOWWINDOW
    [LineWindowManager]::SetWindowPos($targetHwnd, [LineWindowManager]::HWND_NOTOPMOST, 0, 0, 0, 0, $flags) | Out-Null

    $res = @{
        success = $true
        isLineRunning = $true
        found = $true
        targetTitle = $targetTitle
        isLocked = $false
        isTopMost = $false
        action = "unlocked"
    }
    $res | ConvertTo-Json -Compress
    exit 0
}
else {
    $res = @{
        success = $true
        isLineRunning = $true
        found = $true
        targetTitle = $targetTitle
        isLocked = $isMinimizeDisabled
        isTopMost = $isMinimizeDisabled
        action = "status"
    }
    $res | ConvertTo-Json -Compress
    exit 0
}
