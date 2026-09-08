Add-Type -AssemblyName System.Drawing

function New-Icon($size, $path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # rounded rect background with blue gradient
  $r = $size * 0.22
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
  $gp.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
  $gp.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
  $gp.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
  $gp.CloseFigure()

  $p1 = New-Object System.Drawing.Point(0, 0)
  $p2 = New-Object System.Drawing.Point($size, $size)
  $c1 = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
  $c2 = [System.Drawing.Color]::FromArgb(255, 79, 70, 229)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($p1, $p2, $c1, $c2)
  $g.FillPath($brush, $gp)

  # white viewfinder corner brackets
  $penW = [Math]::Max(1.5, $size / 14.0)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $penW)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $m = $size * 0.28
  $len = $size * 0.22

  foreach ($c in @(@(0, 0), @(1, 0), @(0, 1), @(1, 1))) {
    if ($c[0] -eq 0) { $sx = $m; $dx = 1 } else { $sx = $size - $m; $dx = -1 }
    if ($c[1] -eq 0) { $sy = $m; $dy = 1 } else { $sy = $size - $m; $dy = -1 }
    $g.DrawLine($pen, $sx, $sy, $sx + $dx * $len, $sy)
    $g.DrawLine($pen, $sx, $sy, $sx, $sy + $dy * $len)
  }

  # white center dot
  $dotR = $size * 0.09
  $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.FillEllipse($dotBrush, $size / 2 - $dotR, $size / 2 - $dotR, $dotR * 2, $dotR * 2)

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Item -ItemType Directory -Force -Path "icons" | Out-Null
New-Icon 16 "icons/icon16.png"
New-Icon 48 "icons/icon48.png"
New-Icon 128 "icons/icon128.png"
Write-Output "ICONS_DONE"
