# tools/snapshot-app-functions.ps1
# Snapshot: functions/src + src/app + files at repo root → TXT (UTF-8 no BOM) + clipboard

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path .).Path

# UTF-8 without BOM encoder
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# StringBuilder buffer
$sb = New-Object System.Text.StringBuilder
function Append($s){ [void]$sb.AppendLine($s) }

# Targets (folders)
$targets = @(
  (Join-Path $root "functions\src"),
  (Join-Path $root "src\app")
)

# Root files: include common text files at repo root (not folders)
# Limit large files (>2MB) and skip obvious binaries
$rootExtensions = @(
  ".json",".js",".mjs",".cjs",".ts",".tsx",".jsx",
  ".html",".scss",".css",".md",".yml",".yaml",
  ".ps1",".sh",".txt",".rc",".ini",".cfg",".conf"
)

# -------- Helper: ASCII tree --------
function Get-TreeAscii {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter()][bool]$IncludeFiles = $true
  )
  if (-not (Test-Path -LiteralPath $Path)) { return "" }

  $lines = New-Object System.Collections.Generic.List[string]

  function Recurse([string]$p, [string]$prefix) {
    $dirs  = @(Get-ChildItem -LiteralPath $p -Directory | Sort-Object Name)
    $files = @()
    if ($IncludeFiles) { $files = @(Get-ChildItem -LiteralPath $p -File | Sort-Object Name) }

    $items = @()
    $items += $dirs
    $items += $files

    for ($i = 0; $i -lt $items.Count; $i++) {
      $it = $items[$i]
      $isLast = ($i -eq $items.Count - 1)
      $branch = if ($isLast) { '\-- ' } else { '|-- ' }
      $cont   = if ($isLast) { '    ' } else { '|   ' }

      $lines.Add("$prefix$branch$($it.Name)")
      if ($it.PSIsContainer) {
        Recurse -p $it.FullName -prefix ($prefix + $cont)
      }
    }
  }

  $lines.Add((Resolve-Path -LiteralPath $Path).Path)
  Recurse -p $Path -prefix ''
  return ($lines -join "`r`n")
}

# 1) Trees
foreach ($t in $targets) {
  if (Test-Path $t) {
    $rel = $t.Substring($root.Length+1)
    Append "===== TREE (ASCII): $rel ====="
    Append (Get-TreeAscii -Path $t -IncludeFiles:$true)
    Append ""
  }
}

# Also add a root-level tree (files only, top level)
Append "===== TREE (ASCII): <repo root> ====="
$rootList = (Get-ChildItem $root -File | Sort-Object Name)
Append $root
foreach ($f in $rootList) {
  Append ("|-- {0}" -f $f.Name)
}
Append ""

# Exclude dirs (case-insensitive contains match)
$excludeDirs = @('\node_modules\', '\dist\', '\build\', '\out\', '\.angular\', '\.git\', '\.cache\', '\.next\', '\.turbo\')

# 2) File contents (UTF-8 read) for targets
foreach ($t in $targets) {
  if (-not (Test-Path $t)) { continue }

  Get-ChildItem $t -Recurse -File |
    Where-Object {
      $p = $_.FullName.ToLower()
      -not ($excludeDirs | Where-Object { $p -like "*$($_.ToLower())*" })
    } |
    Sort-Object FullName |
    ForEach-Object {
      $rel = $_.FullName.Substring($root.Length+1)
      Append "===== FILE: $rel ====="
      Append (Get-Content -Raw -Encoding UTF8 $_.FullName)
      Append ""
    }
}

# 3) Root files contents (limited to text-like extensions and <= 2 MB)
Get-ChildItem $root -File |
  Where-Object {
    ($rootExtensions -contains $_.Extension.ToLower()) -and ($_.Length -le 2MB)
  } |
  Sort-Object Name |
  ForEach-Object {
    $rel = $_.FullName.Substring($root.Length+1)
    Append "===== FILE: $rel ====="
    Append (Get-Content -Raw -Encoding UTF8 $_.FullName)
    Append ""
  }

# 4) Write TXT (UTF-8 no BOM)
$outPath = Join-Path $root ("snapshot_app_functions_{0}.txt" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
$text = $sb.ToString()
[IO.File]::WriteAllText($outPath, $text, $utf8NoBom)

# 5) Clipboard (best-effort)
$copied = $false
try {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  Set-Clipboard -Value $bytes -AsByteStream
  $copied = $true
} catch {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::SetText($text, [System.Windows.Forms.TextDataFormat]::UnicodeText)
    $copied = $true
  } catch { $copied = $false }
}

Write-Host ("OK: wrote {0}{1}" -f $outPath, $(if($copied){' and copied to clipboard.'} else {'; clipboard skipped/unavailable.'}))
