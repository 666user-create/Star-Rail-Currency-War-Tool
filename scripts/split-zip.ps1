param(
    [Parameter(Mandatory)] [string] $InputFile,
    [Parameter(Mandatory)] [string] $OutDir,
    [int] $PartSizeMB = 50
)
$ErrorActionPreference = 'Stop'
$partSize = $PartSizeMB * 1MB
$src = Resolve-Path $InputFile
$total = (Get-Item $src).Length
$parts = [math]::Ceiling($total / $partSize)
Write-Host "Splitting $src ($([math]::Round($total/1MB,1)) MB) into $parts x ${PartSizeMB}MB"

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory $OutDir | Out-Null }
$inStream = [System.IO.File]::Open($src, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
try {
    for ($i = 1; $i -le $parts; $i++) {
        $outName = Join-Path $OutDir ((Split-Path $src -Leaf) + '.$("{0:D3}" -f $i)')
        $outStream = [System.IO.File]::Open($outName, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try {
            $buf = New-Object byte[] $partSize
            $read = $inStream.Read($buf, 0, $partSize)
            if ($read -lt $partSize) {
                $trim = New-Object byte[] $read
                [Array]::Copy($buf, $trim, $read)
                $outStream.Write($trim, 0, $read)
            } else {
                $outStream.Write($buf, 0, $partSize)
            }
            $outStream.Flush()
            Write-Host "  -> $(Split-Path $outName -Leaf) ($([math]::Round((Get-Item $outName).Length/1MB,1)) MB)"
        } finally {
            $outStream.Dispose()
        }
    }
} finally {
    $inStream.Dispose()
}
Write-Host "Done. 合并方式: 把所有 .### 卷重命名为 .001 .002 ... 然后用 7z x 解压"
