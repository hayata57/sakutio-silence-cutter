$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ManifestPath = Join-Path $Root "gpl-source-manifest.json"
$Manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$Work = Join-Path $Root "release-source-bundle"
$AppOut = Join-Path $Work "sakutio-silence-cutter-source"
$ThirdPartyOut = Join-Path $Work "third-party-sources"
$ResolvedManifest = Join-Path $Work "RESOLVED_SOURCE_COMMITS.txt"
$ZipPath = Join-Path $Root "Sakutio_Silence_Cutter_GPL_Source.zip"

if (Test-Path $Work) { Remove-Item -Recurse -Force $Work }
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
New-Item -ItemType Directory -Force -Path $AppOut, $ThirdPartyOut | Out-Null

$Required = @("git", "powershell")
foreach ($Command in $Required) {
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Command"
  }
}

Write-Host "[source] Copying Sakutio application source"
$TopFiles = @(
  ".gitignore",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "index.html",
  "LICENSE",
  "COPYRIGHT.md",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "SOURCE.md",
  "OPEN_SOURCE_RELEASE.md",
  "gpl-source-manifest.json"
)
foreach ($File in $TopFiles) {
  $Source = Join-Path $Root $File
  if (Test-Path $Source) { Copy-Item -LiteralPath $Source -Destination $AppOut }
}

foreach ($Dir in @("src", "scripts", "public")) {
  $Source = Join-Path $Root $Dir
  $Destination = Join-Path $AppOut $Dir
  Copy-Item -Recurse -Force -LiteralPath $Source -Destination $Destination
}
$GeneratedCore = Join-Path $AppOut "public\ffmpeg-core-gpl"
if (Test-Path $GeneratedCore) { Remove-Item -Recurse -Force $GeneratedCore }

$Lines = New-Object System.Collections.Generic.List[string]
$Lines.Add("Sakutio Silence Cutter GPL source bundle")
$Lines.Add("Generated: $([DateTime]::UtcNow.ToString('o'))")
$Lines.Add("")

# Record the exact Sakutio release commit when the command is run from a Git checkout.
try {
  $AppCommit = (& git -C $Root rev-parse HEAD 2>$null).Trim()
  if ($LASTEXITCODE -eq 0 -and $AppCommit) {
    $Lines.Add("sakutio-silence-cutter`t$AppCommit`tlocal-repository`trequested=HEAD")
    Write-Host "[source] Sakutio app -> $AppCommit"
  }
}
catch {
  Write-Host "[source] Sakutio app commit could not be resolved; continuing with copied source files."
}

function Checkout-Source {
  param(
    [string]$Name,
    [string]$Repository,
    [string]$Ref
  )
  $Destination = Join-Path $ThirdPartyOut $Name
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Push-Location $Destination
  try {
    & git init -q
    if ($LASTEXITCODE -ne 0) { throw "git init failed: $Name" }
    & git remote add origin $Repository
    if ($LASTEXITCODE -ne 0) { throw "git remote add failed: $Name" }
    & git -c core.autocrlf=false fetch --depth 1 origin $Ref
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed: $Name ($Ref)" }
    & git -c core.autocrlf=false checkout --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw "git checkout failed: $Name" }
    $Resolved = (& git rev-parse HEAD).Trim()
    $Lines.Add("$Name`t$Resolved`t$Repository`trequested=$Ref")
    Write-Host "[source] $Name -> $Resolved"

    # The resolved SHA is recorded above; remove VCS metadata so the GPL archive
    # contains source files rather than nested repositories.
    $GitMetadata = Join-Path $Destination ".git"
    if (Test-Path $GitMetadata) { Remove-Item -Recurse -Force $GitMetadata }
  }
  finally {
    Pop-Location
  }
}

foreach ($Source in $Manifest.sources) {
  Checkout-Source -Name $Source.name -Repository $Source.repository -Ref $Source.ref
}

$Lines | Set-Content -LiteralPath $ResolvedManifest -Encoding UTF8
Copy-Item -LiteralPath $ManifestPath -Destination $Work

foreach ($LocalOnly in @("POC_TECH_NOTES.md", "WORK_PROGRESS.md")) {
  if (Test-Path (Join-Path $AppOut $LocalOnly)) {
    throw "Local-only file was unexpectedly copied into the public source bundle: $LocalOnly"
  }
}
Write-Host "[source] Local-only development records excluded from public source bundle"

Write-Host "[source] Creating source ZIP"
Compress-Archive -Path (Join-Path $Work "*") -DestinationPath $ZipPath -CompressionLevel Optimal
Write-Host "[source] Ready: $ZipPath"
Write-Host "[source] Upload this ZIP with the matching public release."
