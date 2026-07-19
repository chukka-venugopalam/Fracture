Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName PresentationCore

# Create output folder for frames
$outputDir = "C:\Users\venugopal\.gemini\antigravity\brain\1df90e04-05fb-4ad8-8f51-46b2b2a1b32d\recording_frames"
if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Clean existing frames
Remove-Item -Path "$outputDir\*" -Force -ErrorAction SilentlyContinue

# Launch Microsoft Edge in GUI mode with isolated profile to prevent handover
$proc = Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList 'http://localhost:3008/?test=true', '--start-maximized', '--user-data-dir=C:\Users\venugopal\OneDrive\Documents\Projects\fracture\scratch\edge_profile_clean' -PassThru
Start-Sleep -Seconds 6

# Bring Microsoft Edge to the foreground
$signature = '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'
$type = Add-Type -MemberDefinition $signature -Name "Win32SetForegroundWindow" -Namespace "Win32" -ErrorAction SilentlyContinue -PassThru
$hwnd = $proc.MainWindowHandle
if (!$hwnd) {
    Start-Sleep -Seconds 2
    $proc.Refresh()
    $hwnd = $proc.MainWindowHandle
}

if ($hwnd) {
    [Win32.Win32SetForegroundWindow]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Seconds 1
}

# Capture loop parameters (18 seconds, 5 frames per second = 90 frames)
$fps = 5
$durationSeconds = 18
$totalFrames = $fps * $durationSeconds
$delayMs = [int](1000 / $fps)

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds

# Helper function to simulate mouse drag
function Simulate-Drag($x1, $y1, $x2, $y2) {
    # Position mouse at start
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x1, $y1)
    Start-Sleep -Milliseconds 50
    # Left click down
    $signatureClick = '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);'
    $typeClick = Add-Type -MemberDefinition $signatureClick -Name "Win32MouseEvent" -Namespace "Win32" -ErrorAction SilentlyContinue -PassThru
    [Win32.Win32MouseEvent]::mouse_event(0x0002, 0, 0, 0, 0) # MOUSEEVENTF_LEFTDOWN
    Start-Sleep -Milliseconds 50
    
    # Drag to end
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x2, $y2)
    Start-Sleep -Milliseconds 50
    
    # Left click up
    [Win32.Win32MouseEvent]::mouse_event(0x0004, 0, 0, 0, 0) # MOUSEEVENTF_LEFTUP
}

Write-Host "Starting continuous screen capture..."

for ($i = 0; $i -lt $totalFrames; $i++) {
    $framePath = Join-Path $outputDir ("frame_" + $i.ToString("D3") + ".png")
    
    # Capture screen
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bitmap.Save($framePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()

    # Simulate keyboard scrolling down (each page down scrolls by 1 viewport height, matching 0.2 intervals of 500vh):
    # 0.00 -> 0.20 (frame 10)
    # 0.20 -> 0.40 (frame 16)
    # 0.40 -> 0.60 (frame 22)
    # 0.60 -> 0.80 (frame 28)
    # 0.80 -> 1.00 (frame 34)
    if ($i -eq 10) { [System.Windows.Forms.SendKeys]::SendWait('{PGDN}') }
    if ($i -eq 16) { [System.Windows.Forms.SendKeys]::SendWait('{PGDN}') }
    if ($i -eq 22) { [System.Windows.Forms.SendKeys]::SendWait('{PGDN}') }
    if ($i -eq 28) { [System.Windows.Forms.SendKeys]::SendWait('{PGDN}') }
    if ($i -eq 34) { [System.Windows.Forms.SendKeys]::SendWait('{PGDN}') }

    # Simulate mouse drag/rotate at the bottom (around frame 42)
    if ($i -eq 42) {
        # Drag middle of screen horizontally to rotate
        $centerX = [int]($bounds.Width / 2)
        $centerY = [int]($bounds.Height / 2)
        Simulate-Drag ($centerX - 100) $centerY ($centerX + 150) $centerY
    }

    # Simulate scrolling back up:
    # 1.00 -> 0.80 (frame 52)
    # 0.80 -> 0.60 (frame 58)
    # 0.60 -> 0.40 (frame 64)
    # 0.40 -> 0.20 (frame 70)
    # 0.20 -> 0.00 (frame 76)
    if ($i -eq 52) { [System.Windows.Forms.SendKeys]::SendWait('{PGUP}') }
    if ($i -eq 58) { [System.Windows.Forms.SendKeys]::SendWait('{PGUP}') }
    if ($i -eq 64) { [System.Windows.Forms.SendKeys]::SendWait('{PGUP}') }
    if ($i -eq 70) { [System.Windows.Forms.SendKeys]::SendWait('{PGUP}') }
    if ($i -eq 76) { [System.Windows.Forms.SendKeys]::SendWait('{PGUP}') }

    Start-Sleep -Milliseconds $delayMs
}

# Close Microsoft Edge
try {
    $proc.Kill()
} catch {}

Write-Host "Compiling frames into single unified recording.gif..."
$encoder = New-Object System.Windows.Media.Imaging.GifBitmapEncoder
$files = Get-ChildItem -Path $outputDir -Filter "frame_*.png" | Sort-Object Name

foreach ($file in $files) {
    $uri = New-Object System.Uri $file.FullName
    $frame = [System.Windows.Media.Imaging.BitmapFrame]::Create($uri)
    $encoder.Frames.Add($frame)
}

$gifPath = "C:\Users\venugopal\.gemini\antigravity\brain\1df90e04-05fb-4ad8-8f51-46b2b2a1b32d\recording.gif"
$stream = [System.IO.File]::OpenWrite($gifPath)
$encoder.Save($stream)
$stream.Close()

Write-Host "Screen capture complete. recording.gif saved to $gifPath."
