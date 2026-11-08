param([Parameter(Mandatory=$true)][string]$InputPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  Add-Type -AssemblyName System.Drawing
  $null=[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
  $null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
  $null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
  $null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
  $awaiter=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'} | Select-Object -First 1
  function Await-Value($operation,[Type]$type) {$task=$awaiter.MakeGenericMethod($type).Invoke($null,@($operation));$task.Wait();return $task.Result}
  $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language('en-US')))
  if(-not $engine){$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
  if(-not $engine){throw 'No local OCR recognizer is available.'}
  $file=[IO.Path]::GetFullPath($InputPath)
  if((Get-Item -LiteralPath $file).Length -gt 512000){throw 'Input too large.'}
  $items=[IO.File]::ReadAllText($file) | ConvertFrom-Json
  if($null -eq $items){$items=@()}elseif($items -isnot [Array]){$items=@($items)}
  if($items.Count -gt 24){throw 'Too many glyphs.'}
  $output=@()
  foreach($item in $items){
    $w=[int]$item.width;$h=[int]$item.height;$pixels=[string]$item.pixels
    if($w -lt 1 -or $h -lt 8 -or $w -gt 180 -or $h -gt 180 -or $pixels.Length -ne $w*$h -or $pixels -match '[^01]'){continue}
    $values=@()
    foreach($target in @(48,64)){
      $gw=[int][Math]::Max(1,[Math]::Round($w*$target/[double]$h))
      $bitmap=New-Object Drawing.Bitmap((200+$gw+20),($target+40))
      $glyph=New-Object Drawing.Bitmap($w,$h)
      $graphics=$null;$font=$null;$memory=$null;$stream=$null;$software=$null
      try {
        for($y=0;$y -lt $h;$y++){for($x=0;$x -lt $w;$x++){$color=if($pixels[$y*$w+$x] -eq '1'){[Drawing.Color]::Black}else{[Drawing.Color]::White};$glyph.SetPixel($x,$y,$color)}}
        $graphics=[Drawing.Graphics]::FromImage($bitmap);$graphics.Clear([Drawing.Color]::White)
        $graphics.TextRenderingHint=[Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $font=New-Object Drawing.Font('Arial',([single]($target*5.0/6)),[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
        $graphics.DrawString('Count',$font,[Drawing.Brushes]::Black,8,18)
        $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($glyph,(New-Object Drawing.Rectangle(200,18,$gw,$target)))
        $memory=New-Object IO.MemoryStream;$bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png);$memory.Position=0
        $stream=[System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($memory)
        $decoder=Await-Value ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $software=Await-Value ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $recognized=Await-Value ($engine.RecognizeAsync($software)) ([Windows.Media.Ocr.OcrResult])
        # Artificial context is strictly outside this rectangle. Only real cropped pixel glyphs may supply a value.
        $numbers=@($recognized.Lines | ForEach-Object {$_.Words} | Where-Object {$_.Text -match '^\d{1,2}$' -and $_.BoundingRect.X -ge 180 -and $_.BoundingRect.X+$_.BoundingRect.Width -le 200+$gw+12 -and $_.BoundingRect.Height -ge $target*.6} | ForEach-Object {[int]$_.Text})
        if($numbers.Count -eq 1 -and $numbers[0] -ge 1 -and $numbers[0] -le 99){$values+=@($numbers[0])}else{$values+=@($null)}
      } finally {if($software){$software.Dispose()};if($stream){$stream.Dispose()};if($memory){$memory.Dispose()};if($font){$font.Dispose()};if($graphics){$graphics.Dispose()};$glyph.Dispose();$bitmap.Dispose()}
    }
    if($values.Count -eq 2 -and $null -ne $values[0] -and $values[0] -eq $values[1]){$output+=@{id=[string]$item.id;count=[int]$values[0]}}
  }
  [Console]::Out.WriteLine((@{ok=$true;counts=@($output)} | ConvertTo-Json -Compress -Depth 5))
} catch {[Console]::Out.WriteLine((@{ok=$false;error=$_.Exception.Message;counts=@()} | ConvertTo-Json -Compress));exit 1}
