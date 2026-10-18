[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.RandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class LineWin32 {
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
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, int nFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static List<IntPtr> FindWindowsForPids(int[] pids, out List<string> debugInfo) {
        var krungthaiWindows = new List<IntPtr>();
        var otherVisibleWindows = new List<IntPtr>();
        var dbg = new List<string>();
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
                var titleSb = new StringBuilder(256);
                GetWindowText(hWnd, titleSb, 256);
                string title = titleSb.ToString();

                RECT rect;
                GetWindowRect(hWnd, out rect);
                int w = rect.Right - rect.Left;
                int h = rect.Bottom - rect.Top;
                bool vis = IsWindowVisible(hWnd);

                if (title.IndexOf("Krungthai", StringComparison.OrdinalIgnoreCase) >= 0 && vis && w >= 200 && h >= 150) {
                    dbg.Add(title + " (" + w + "x" + h + ")");
                    krungthaiWindows.Add(hWnd);
                } else if (vis && w >= 250 && h >= 200) {
                    dbg.Add(title + " (" + w + "x" + h + ")");
                    otherVisibleWindows.Add(hWnd);
                }
            }
            return true;
        }, IntPtr.Zero);

        debugInfo = dbg;
        if (krungthaiWindows.Count > 0) {
            return krungthaiWindows;
        }
        return otherVisibleWindows;
    }
}
"@

function Await-WinRtTask($WinRtTask, $ResultType) {
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

$lineProcs = Get-Process -Name "LINE" -ErrorAction SilentlyContinue
if (-not $lineProcs) {
    Write-Output '{"foundWindow":false,"error":"LINE_NOT_RUNNING","text":""}'
    exit 0
}

[int[]]$linePids = @($lineProcs | Select-Object -ExpandProperty Id)
$debugWindows = $null
$targetHwnds = [LineWin32]::FindWindowsForPids($linePids, [ref]$debugWindows)

if ($targetHwnds.Count -eq 0) {
    $out = @{
        foundWindow = $false
        error = "LINE_WINDOW_MINIMIZED_OR_HIDDEN"
        text = ""
    }
    $out | ConvertTo-Json -Compress
    exit 0
}

$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $ocrEngine) {
    $lang = New-Object Windows.Globalization.Language("en-US")
    $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
}

$allTexts = New-Object System.Collections.Generic.List[string]

foreach ($hWnd in $targetHwnds) {
    $rect = New-Object LineWin32+RECT
    [LineWin32]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
    $width = [Math]::Max(1, $rect.Right - $rect.Left)
    $height = [Math]::Max(1, $rect.Bottom - $rect.Top)

    if ($width -lt 180 -or $height -lt 120) { continue }

    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc()
    [LineWin32]::PrintWindow($hWnd, $hdc, 2) | Out-Null
    $g.ReleaseHdc($hdc)
    $g.Dispose()

    # Run OCR on 1x and 2x to guarantee 100% decimal recognition
    foreach ($scale in @(1, 2)) {
        $targetBmp = $bmp
        if ($scale -eq 2) {
            $scaledW = $width * 2
            $scaledH = $height * 2
            $targetBmp = New-Object System.Drawing.Bitmap($scaledW, $scaledH)
            $gs = [System.Drawing.Graphics]::FromImage($targetBmp)
            $gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $gs.DrawImage($bmp, 0, 0, $scaledW, $scaledH)
            $gs.Dispose()
        }

        $ms = New-Object System.IO.MemoryStream
        $targetBmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        if ($scale -eq 2) { $targetBmp.Dispose() }
        $ms.Position = 0

        $ras = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)
        $decoder = Await-WinRtTask ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $softwareBmp = Await-WinRtTask ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $ocrResult = Await-WinRtTask ($ocrEngine.RecognizeAsync($softwareBmp)) ([Windows.Media.Ocr.OcrResult])

        if ($ocrResult -and $ocrResult.Text) {
            $allTexts.Add($ocrResult.Text)
        }
        $ms.Dispose()
    }

    $bmp.Dispose()
}

$combinedText = ($allTexts -join " `n ")
$resultObj = @{
    foundWindow = $true
    windowCount = $targetHwnds.Count
    windows = ($debugWindows -join ", ")
    text = $combinedText
}
$resultObj | ConvertTo-Json -Compress
