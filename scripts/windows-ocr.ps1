param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [string]$LanguageTag = 'zh-Hans-CN'
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$stage = 'engine'
$totalClock = [Diagnostics.Stopwatch]::StartNew()

function Write-Result($value) {
  [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 10))
}

function Line-Box($line) {
  $words = @($line.words)
  if ($words.Count -eq 0) { return $null }
  $left = ($words | ForEach-Object { $_.x } | Measure-Object -Minimum).Minimum
  $top = ($words | ForEach-Object { $_.y } | Measure-Object -Minimum).Minimum
  $right = ($words | ForEach-Object { $_.x + $_.width } | Measure-Object -Maximum).Maximum
  $bottom = ($words | ForEach-Object { $_.y + $_.height } | Measure-Object -Maximum).Maximum
  return @{ text = ($line.text -replace '\s', ''); x = $left; y = $top; width = $right - $left; height = $bottom - $top }
}

function Result-Lines($result, [double]$originX = 0, [double]$originY = 0, [double]$factor = 1) {
  return @($result.Lines | ForEach-Object {
    @{ text = $_.Text; words = @($_.Words | ForEach-Object {
      @{ text = $_.Text; x = $originX + $_.BoundingRect.X/$factor; y = $originY + $_.BoundingRect.Y/$factor;
         width = $_.BoundingRect.Width/$factor; height = $_.BoundingRect.Height/$factor }
    }) }
  })
}

function Page-AnchorScore([string]$text) {
  $label=$text -replace '\s',''; $score=0
  foreach($pattern in @('我的[阵陣]容|MyLineup','[标標][准準]博弈|超[频頻]博弈|StandardGambit|Overclock.*Gambit',
    '[对對]局[胜勝]利|[对對]局失[败敗利]|TriggerAscensionMatch|^Victory$|^Defeat$',
    '下一[页頁]|返回[货貨][币幣][战戰][争爭]|NextPage|ReturntoCurrencyWars',
    '投[资資][环環]境|投[资資]策略|[羁羈][绊絆](信息|[资資][讯訊])|[Il]nvestment|Bond[Il]nformation')){
    if($label -match $pattern){$score++}
  }
  return $score
}

function Install-ImageTools {
  Add-Type -AssemblyName System.Drawing
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
public sealed class RatingContextImage {
  public Bitmap Image;
  public Rectangle Bounds;
  public int GlyphWidth;
}
public static class CurrencyOcrImageTools {
  public static Bitmap FromBgra(byte[] pixels, int width, int height) {
    Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
    BitmapData data = bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
    try { for(int y=0;y<height;y++) Marshal.Copy(pixels,y*width*4,IntPtr.Add(data.Scan0,y*data.Stride),width*4); }
    finally { bitmap.UnlockBits(data); }
    return bitmap;
  }
  public static byte[] Png(Bitmap bitmap) {
    using(MemoryStream stream=new MemoryStream()) { bitmap.Save(stream,ImageFormat.Png);return stream.ToArray(); }
  }
  public static Bitmap Crop(Bitmap source, Rectangle bounds, int factor, int threshold) {
    using(Bitmap small = new Bitmap(bounds.Width,bounds.Height,PixelFormat.Format32bppArgb)) {
      using(Graphics g=Graphics.FromImage(small)) g.DrawImage(source,new Rectangle(0,0,bounds.Width,bounds.Height),bounds,GraphicsUnit.Pixel);
      if(threshold>=0) for(int y=0;y<small.Height;y++) for(int x=0;x<small.Width;x++) {
        Color c=small.GetPixel(x,y);int light=(c.R*299+c.G*587+c.B*114)/1000;
        small.SetPixel(x,y,light>=threshold?Color.Black:Color.White);
      }
      Bitmap scaled=new Bitmap(bounds.Width*factor,bounds.Height*factor,PixelFormat.Format32bppArgb);
      using(Graphics g=Graphics.FromImage(scaled)) {g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(small,new Rectangle(0,0,scaled.Width,scaled.Height));}
      return scaled;
    }
  }
  public static RatingContextImage SingleGlyphContext(Bitmap source,Rectangle bounds,int threshold) {
    int w=bounds.Width,h=bounds.Height;bool[] mask=new bool[w*h],seen=new bool[w*h];int[] queue=new int[w*h];
    List<int[]> parts=new List<int[]>();int largest=0;
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){Color c=source.GetPixel(bounds.X+x,bounds.Y+y);mask[y*w+x]=(c.R*299+c.G*587+c.B*114)/1000>=threshold;}
    for(int index=0;index<mask.Length;index++){
      if(!mask[index]||seen[index])continue;int head=0,tail=0;queue[tail++]=index;seen[index]=true;int left=w,top=h,right=0,bottom=0;
      while(head<tail){int item=queue[head++],x=item%w,y=item/w;left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);
        for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;int next=ny*w+nx;
          if(mask[next]&&!seen[next]){seen[next]=true;queue[tail++]=next;}}
      }parts.Add(new[]{tail,left,top,right,bottom});largest=Math.Max(largest,tail);
    }
    if(largest<Math.Max(12,w*h*.008))return null;
    int bx=w,by=h,br=0,bb=0;foreach(int[] p in parts)if(p[0]>=largest*.2){bx=Math.Min(bx,p[1]);by=Math.Min(by,p[2]);br=Math.Max(br,p[3]);bb=Math.Max(bb,p[4]);}
    int gw=br-bx+1,gh=bb-by+1;
    // 此通道只处理单个窄字。SS/SSS 仍由原比例评分区域识别，避免挤成两个 S。
    if(gw<=0||gh<8||gw/(double)gh>1.15||gw/(double)gh<.25)return null;
    int ink=0;for(int y=by;y<=bb;y++)for(int x=bx;x<=br;x++)if(mask[y*w+x])ink++;
    if(ink/(double)(gw*gh)<.12||ink/(double)(gw*gh)>.9)return null;
    int targetWidth=Math.Max(1,(int)(gw*52.0/gh));Bitmap image=new Bitmap(170+targetWidth+25,100,PixelFormat.Format32bppArgb);
    using(Bitmap glyph=new Bitmap(gw,gh,PixelFormat.Format32bppArgb)){
      for(int y=0;y<gh;y++)for(int x=0;x<gw;x++)glyph.SetPixel(x,y,mask[(y+by)*w+x+bx]?Color.Black:Color.White);
      using(Graphics g=Graphics.FromImage(image)){g.Clear(Color.White);g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        using(Font font=new Font("Arial",40,FontStyle.Regular,GraphicsUnit.Pixel))g.DrawString("Grade",font,Brushes.Black,8,23);
        g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(glyph,new Rectangle(170,20,targetWidth,52));}
    }
    return new RatingContextImage{Image=image,Bounds=new Rectangle(bounds.X+bx,bounds.Y+by,gw,gh),GlyphWidth=targetWidth};
  }
}
'@
}

function Recognize-Drawing($image, $recognizer) {
  $bytes = [CurrencyOcrImageTools]::Png($image)
  $memory = New-Object IO.MemoryStream(,$bytes)
  $random = $null
  try {
    $random = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($memory)
    $imageDecoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($random)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $software = Await-Result ($imageDecoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    try { return Await-Result ($recognizer.RecognizeAsync($software)) ([Windows.Media.Ocr.OcrResult]) }
    finally { $software.Dispose() }
  } finally { if ($random) {$random.Dispose()}; $memory.Dispose() }
}

function Safe-Rectangle([double]$x, [double]$y, [double]$right, [double]$bottom, [int]$width, [int]$height) {
  $left = [int][Math]::Max(0,[Math]::Floor($x)); $top = [int][Math]::Max(0,[Math]::Floor($y))
  $endX = [int][Math]::Min($width,[Math]::Ceiling($right)); $endY = [int][Math]::Min($height,[Math]::Ceiling($bottom))
  if ($endX-$left -lt 8 -or $endY-$top -lt 8) { return $null }
  return New-Object Drawing.Rectangle($left,$top,($endX-$left),($endY-$top))
}

function Read-ExtraRegions($decoder, $transform, $bitmap, $lines, $recognizer) {
  $boxes = @($lines | ForEach-Object { Line-Box $_ } | Where-Object { $_ })
  $lineup = $boxes | Where-Object { $_.text -match '我的[阵陣]容|MyLineup' } | Select-Object -First 1
  if (-not $lineup -or $bitmap.PixelWidth*$bitmap.PixelHeight -gt 20000000) { return @() }
  Install-ImageTools
  $pixelOperation=$decoder.GetPixelDataAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
    $transform,[Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,[Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)
  $provider=Await-Result $pixelOperation ([Windows.Graphics.Imaging.PixelDataProvider])
  $source=[CurrencyOcrImageTools]::FromBgra($provider.DetachPixelData(),$bitmap.PixelWidth,$bitmap.PixelHeight)
  try {
    $width=[int]$bitmap.PixelWidth; $height=[int]$bitmap.PixelHeight; $regions=@()
    $headerAnchor=$boxes | Where-Object { $_.x -ge $lineup.x-$width*.05 -and $_.y -lt $lineup.y -and
      $_.text -match '小[队隊]生命值|SquadHP|(?:[财財]富)?造物主\d|[资資]本帝王\d|AmethystGold\d' } | Sort-Object y | Select-Object -First 1
    if($headerAnchor){
      $header=Safe-Rectangle ($lineup.x-$width*.02) ($headerAnchor.y-$headerAnchor.height*.8) ($width*.94) ($headerAnchor.y+$headerAnchor.height*1.9) $width $height
      if($header){foreach($threshold in @(-1,200)){
        $factor=[int][Math]::Max(1,[Math]::Min(3,[Math]::Floor([Windows.Media.Ocr.OcrEngine]::MaxImageDimension/[double][Math]::Max($header.Width,$header.Height))))
        $crop=[CurrencyOcrImageTools]::Crop($source,$header,$factor,$threshold)
        try{$recognized=Recognize-Drawing $crop $recognizer; $regions+=@{kind='header';variant=('header-'+$threshold);lines=@(Result-Lines $recognized $header.X $header.Y $factor)}}finally{$crop.Dispose()}
      }}
    }
    $title=$boxes | Where-Object { $_.x -lt $lineup.x -and $_.text -match '[对對]局[胜勝]利|[对對]局失[败敗利]|触发晋升赛|TriggerAscensionMatch|^Victory$|^Defeat$' } | Select-Object -First 1
    $mode=$boxes | Where-Object { $_.x -lt $lineup.x -and $_.text -match '[标標][准準]博弈|超[频頻]博弈|StandardGambit|Overclock.*Gambit' } | Select-Object -First 1
    if(-not $mode -and $title){$mode=$boxes | Where-Object { $_.x -lt $lineup.x -and $_.y -gt $title.y+$title.height -and $_.text -match '(?:造物主|帝王|AmethystGold|WealthCreator)\d' } | Sort-Object y | Select-Object -First 1}
    if($title -and $mode){
      $left=[Math]::Min($mode.x,$title.x-$width*.07)
      $rating=Safe-Rectangle $left ($title.y+$title.height+$height*.005) ($lineup.x-$width*.01) ($mode.y-$height*.02) $width $height
      if($rating){
        $english=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language('en-US')))
        if(-not $english){$english=$recognizer}
        foreach($threshold in @(170,190,200,210)){
          $factor=[int][Math]::Max(1,[Math]::Min(3,[Math]::Floor([Windows.Media.Ocr.OcrEngine]::MaxImageDimension/[double][Math]::Max($rating.Width,$rating.Height))))
          $crop=[CurrencyOcrImageTools]::Crop($source,$rating,$factor,$threshold)
          try{$recognized=Recognize-Drawing $crop $english; $regions+=@{kind='rating';variant=('binary-'+$threshold);lines=@(Result-Lines $recognized $rating.X $rating.Y $factor)}}finally{$crop.Dispose()}
        }
        foreach($threshold in @(140,170)){
          $context=[CurrencyOcrImageTools]::SingleGlyphContext($source,$rating,$threshold)
          if(-not $context){continue}
          try{
            $recognized=Recognize-Drawing $context.Image $english
            $factor=52.0/$context.Bounds.Height; $real=@()
            foreach($recognizedLine in $recognized.Lines){foreach($word in $recognizedLine.Words){
              # Grade 是排版上下文，不是原图文字；仅保留真实字形区域里的独立评级词。
              if($word.BoundingRect.X+$word.BoundingRect.Width/2 -lt 154 -or $word.Text -notmatch '^(SSS|SS|S|A|B|C|D)$'){continue}
              $mapped=@{text=$word.Text;x=$context.Bounds.X+($word.BoundingRect.X-170)/$factor;y=$context.Bounds.Y+($word.BoundingRect.Y-20)/$factor;
                width=$word.BoundingRect.Width/$factor;height=$word.BoundingRect.Height/$factor}
              $real+=@{text=$word.Text;words=@($mapped)}
            }}
            $regions+=@{kind='rating';variant=('single-glyph-'+$threshold);lines=$real}
          }finally{$context.Image.Dispose()}
        }
      }
    }
    $bondHeading=$boxes | Where-Object {$_.text -match '[羁羈][绊絆](信息|[资資][讯訊])|Bond[Il]nformation'} | Select-Object -First 1
    if($bondHeading -and $bondHeading.y -lt $lineup.y){
      $bond=Safe-Rectangle ($bondHeading.x-$width*.005) ($bondHeading.y+$bondHeading.height) ($width*.93) ($lineup.y-$height*.008) $width $height
      if($bond){$crop=[CurrencyOcrImageTools]::Crop($source,$bond,2,-1);try{$recognized=Recognize-Drawing $crop $recognizer;$regions+=@{kind='bonds';variant='upscaled';lines=@(Result-Lines $recognized $bond.X $bond.Y 2)}}finally{$crop.Dispose()}}
    }
    return $regions
  }finally{$source.Dispose()}
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapTransform, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.ExifOrientationMode, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.ColorManagementMode, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.PixelDataProvider, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
  $script:asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  if (-not $script:asTask) { throw 'Windows Runtime asynchronous bridge is unavailable.' }
  function Await-Result($operation, [Type]$type) {
    $task = $script:asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    $task.Wait()
    return $task.Result
  }

  $language = New-Object Windows.Globalization.Language($LanguageTag)
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
  $warnings = @()
  if (-not $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if (-not $engine) { throw 'No installed Windows OCR recognizer is available.' }
    $warnings += '系统中文 OCR 不可用，已使用其他已安装语言识别，请重点核对中文字段。'
  }

  $stage = 'image'
  $fullPath = [IO.Path]::GetFullPath($ImagePath)
  if (-not [IO.File]::Exists($fullPath)) { throw 'The selected screenshot no longer exists.' }
  # 从调用者指定的本地文件创建只读流，不请求 Windows 文件代理枚举或授权其他位置。
  $fileStream = [IO.File]::OpenRead($fullPath)
  $stream = $null
  try {
    $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fileStream)
    $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $originalWidth = [int]$decoder.PixelWidth
    $originalHeight = [int]$decoder.PixelHeight
    $limit = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
    $scale = [Math]::Min(1.0, $limit / [double][Math]::Max($originalWidth, $originalHeight))
    $transform = New-Object Windows.Graphics.Imaging.BitmapTransform
    $transform.ScaledWidth = [uint32][Math]::Max(1, [Math]::Floor($originalWidth * $scale))
    $transform.ScaledHeight = [uint32][Math]::Max(1, [Math]::Floor($originalHeight * $scale))
    $bitmapOperation = $decoder.GetSoftwareBitmapAsync(
      [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
      [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
      $transform,
      [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,
      [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)
    $bitmap = Await-Result $bitmapOperation ([Windows.Graphics.Imaging.SoftwareBitmap])
    try {
      $stage = 'recognize'
      $result = Await-Result ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      $lines = @(Result-Lines $result)
      $text=$result.Text
      $anchorScore=Page-AnchorScore $text
      # 窗口缩放会改变 OCR 的文字尺度。同一整张图片按常见宽度重试，不新增截图，
      # 仅完整界面标签更多时采用；局部裁剪永远不参与页面与胜负判定。
      if($anchorScore -lt 5 -and $text -notmatch '最\s*新\s*通\s*[关關]\s*[战戰]\s*[绩績]'){
        foreach($targetWidth in @(1280,1920)){
          if([Math]::Abs($targetWidth-$bitmap.PixelWidth) -lt 30){continue}
          $retryScale=$targetWidth/[double]$originalWidth
          if($originalHeight*$retryScale -gt $limit){continue}
          $retryTransform=New-Object Windows.Graphics.Imaging.BitmapTransform
          $retryTransform.ScaledWidth=[uint32]$targetWidth
          $retryTransform.ScaledHeight=[uint32][Math]::Max(1,[Math]::Floor($originalHeight*$retryScale))
          $retryOperation=$decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
            $retryTransform,[Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,[Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)
          $retryBitmap=Await-Result $retryOperation ([Windows.Graphics.Imaging.SoftwareBitmap])
          try{
            $retryResult=Await-Result ($engine.RecognizeAsync($retryBitmap)) ([Windows.Media.Ocr.OcrResult])
            $retryScore=Page-AnchorScore $retryResult.Text
            if($retryScore -gt $anchorScore){
              $lines=@(Result-Lines $retryResult 0 0 ($retryBitmap.PixelWidth/[double]$bitmap.PixelWidth))
              $text=$retryResult.Text; $anchorScore=$retryScore
            }
          }finally{$retryBitmap.Dispose()}
          if($anchorScore -ge 5){break}
        }
      }
      $regions = @()
      try { $regions = @(Read-ExtraRegions $decoder $transform $bitmap $lines $engine) }
      catch { $warnings += '部分区域增强识别未完成，已保留整图文字，请按原图核对空白字段。' }
      $totalClock.Stop()
      Write-Result @{
        ok = $true
        width = $bitmap.PixelWidth
        height = $bitmap.PixelHeight
        language = $engine.RecognizerLanguage.LanguageTag
        text = $text
        lines = $lines
        warnings = $warnings
        regions = $regions
        milliseconds = $totalClock.ElapsedMilliseconds
      }
    } finally { if ($bitmap) { $bitmap.Dispose() } }
  } finally {
    if ($stream) { $stream.Dispose() }
    $fileStream.Dispose()
  }
} catch {
  # 只传阶段与简短诊断，调用方会保留原图和草稿供手动填写。
  Write-Result @{ ok = $false; stage = $stage; error = $_.Exception.Message }
  exit 1
}
