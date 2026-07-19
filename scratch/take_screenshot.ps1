Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Launch Microsoft Edge in GUI mode
$proc = Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList 'http://localhost:3000/?test=true', '--start-maximized' -PassThru
Start-Sleep -Seconds 6

# Bring Microsoft Edge to the foreground
$signature = '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'
$type = Add-Type -MemberDefinition $signature -Name "Win32SetForegroundWindow" -Namespace "Win32" -PassThru
$hwnd = (Get-Process -Name msedge | Where-Object { $_.MainWindowTitle -match 'Edge|Fracture' } | Select-Object -First 1).MainWindowHandle
if ($hwnd) {
    [Win32.Win32SetForegroundWindow]::SetForegroundWindow($hwnd)
    Start-Sleep -Seconds 1
}

# Capture page at top (glass state)
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save('C:\Users\venugopal\OneDrive\Documents\Projects\fracture\screenshot_gui_top.png', [System.Drawing.Imaging.ImageFormat]::Png)

# Physically scroll down using SendKeys
[System.Windows.Forms.SendKeys]::SendWait('{PGDN}')
Start-Sleep -Seconds 3

# Capture page scrolled down (liquid metal state)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save('C:\Users\venugopal\OneDrive\Documents\Projects\fracture\screenshot_gui_bottom.png', [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$graphics.Dispose()
$bitmap.Dispose()

# Close Microsoft Edge
$proc.Kill()
