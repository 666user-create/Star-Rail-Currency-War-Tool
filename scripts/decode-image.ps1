param([Parameter(Mandatory=$true)][string]$ImagePath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  Add-Type -AssemblyName System.Drawing
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.PixelDataProvider, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapTransform, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.ExifOrientationMode, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.ColorManagementMode, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  function Await-Image($operation, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation)); $task.Wait(); return $task.Result
  }
  $fileStream = [IO.File]::OpenRead([IO.Path]::GetFullPath($ImagePath))
  $stream = $null; $bitmap = $null; $output = $null
  try {
    $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fileStream)
    $decoder = Await-Image ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $width = [int]$decoder.PixelWidth; $height = [int]$decoder.PixelHeight
    if ($width -le 0 -or $height -le 0 -or [long]$width*$height -gt 60000000) { throw 'Invalid image dimensions' }
    $transform = New-Object Windows.Graphics.Imaging.BitmapTransform
    $pixels = Await-Image ($decoder.GetPixelDataAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
      [Windows.Graphics.Imaging.BitmapAlphaMode]::Straight, $transform,
      [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,
      [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.PixelDataProvider])
    $bytes = $pixels.DetachPixelData()
    $bitmap = New-Object Drawing.Bitmap($width, $height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $locked = $bitmap.LockBits((New-Object Drawing.Rectangle(0,0,$width,$height)), [Drawing.Imaging.ImageLockMode]::WriteOnly, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try { [Runtime.InteropServices.Marshal]::Copy($bytes,0,$locked.Scan0,$bytes.Length) } finally { $bitmap.UnlockBits($locked) }
    $output = New-Object IO.MemoryStream
    $bitmap.Save($output,[Drawing.Imaging.ImageFormat]::Png)
    [Console]::Out.WriteLine([Convert]::ToBase64String($output.ToArray()))
  } finally {
    if ($output) { $output.Dispose() }; if ($bitmap) { $bitmap.Dispose() }
    if ($stream) { $stream.Dispose() }; $fileStream.Dispose()
  }
} catch { [Console]::Error.WriteLine('Unable to decode selected image'); exit 1 }
