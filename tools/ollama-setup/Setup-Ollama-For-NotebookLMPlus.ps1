param(
    [string]$SiteUrl = "https://MBonandrini.github.io/NotebookLMPlus/",
    [string]$ChatModel = "qwen3:4b",
    [string]$EmbeddingModel = "embeddinggemma",
    [switch]$InstallModels,
    [switch]$SkipRestart,
    [switch]$SkipTest
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Normalize-Origin([string]$Url) {
    $Url = $Url.Trim()
    if ([string]::IsNullOrWhiteSpace($Url)) { throw "No site URL was supplied." }
    if ($Url -notmatch '^https?://') { $Url = "https://$Url" }
    $Uri = [System.Uri]$Url
    if (-not $Uri.Host) { throw "Could not determine a host from: $Url" }
    $Builder = New-Object System.UriBuilder($Uri.Scheme, $Uri.Host)
    if (-not $Uri.IsDefaultPort) { $Builder.Port = $Uri.Port } else { $Builder.Port = -1 }
    return $Builder.Uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/')
}

function Find-OllamaExe {
    $Cmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($Cmd) { return $Cmd.Source }
    $Candidates = @(
        "$env:LOCALAPPDATA\\Programs\\Ollama\\ollama.exe",
        "$env:LOCALAPPDATA\\Ollama\\ollama.exe",
        "$env:ProgramFiles\\Ollama\\ollama.exe"
    )
    foreach ($Path in $Candidates) { if (Test-Path $Path) { return $Path } }
    return $null
}

function Test-OllamaApi([string]$Origin) {
    try {
        $Headers = @{ Origin = $Origin }
        $Response = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -Headers $Headers -Method Get -TimeoutSec 8 -UseBasicParsing
        $Allowed = $Response.Headers['Access-Control-Allow-Origin']
        return @{ Ok = ($Response.StatusCode -eq 200); AllowedOrigin = $Allowed; Body = $Response.Content }
    } catch {
        return @{ Ok = $false; AllowedOrigin = $null; Error = $_.Exception.Message }
    }
}

Clear-Host
Write-Host "NotebookLMPlus - One-Click Ollama Setup" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "This configures Ollama so the NotebookLMPlus GitHub Pages app can use it directly."
Write-Host "No Python bridge is installed."

$Origin = Normalize-Origin $SiteUrl
Write-Step "Trusted GitHub Pages origin"
Write-Host $Origin -ForegroundColor Yellow

$Current = [Environment]::GetEnvironmentVariable("OLLAMA_ORIGINS", "User")
$Origins = New-Object System.Collections.Generic.List[string]
if (-not [string]::IsNullOrWhiteSpace($Current)) {
    foreach ($Item in ($Current -split ',')) {
        $Clean = $Item.Trim()
        if ($Clean -and -not $Origins.Contains($Clean)) { $Origins.Add($Clean) }
    }
}
if (-not $Origins.Contains($Origin)) { $Origins.Add($Origin) }
$NewValue = ($Origins -join ',')

Write-Step "Saving OLLAMA_ORIGINS for this Windows user"
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", $NewValue, "User")
$env:OLLAMA_ORIGINS = $NewValue
Write-Host "OLLAMA_ORIGINS=$NewValue"

$OllamaExe = Find-OllamaExe
if (-not $OllamaExe) {
    Write-Host ""
    Write-Host "Ollama was not found on this computer." -ForegroundColor Red
    Write-Host "Install Ollama for Windows, launch it once, then run this setup again."
    Read-Host "Press Enter to close"
    exit 2
}

Write-Step "Ollama found"
Write-Host $OllamaExe

if (-not $SkipRestart) {
    Write-Step "Restarting Ollama"
    Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-Process -FilePath $OllamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

if (-not $InstallModels) {
    Write-Host ""
    $Answer = Read-Host "Install recommended models ($ChatModel + $EmbeddingModel) if needed? [y/N]"
    if ($Answer -match '^(y|yes)$') { $InstallModels = $true }
}

if ($InstallModels) {
    Write-Step "Installing/checking recommended chat model: $ChatModel"
    & $OllamaExe pull $ChatModel
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull chat model: $ChatModel" }

    Write-Step "Installing/checking recommended embedding model: $EmbeddingModel"
    & $OllamaExe pull $EmbeddingModel
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull embedding model: $EmbeddingModel" }
}

if (-not $SkipTest) {
    Write-Step "Testing Ollama API and browser-origin access"
    $Result = $null
    for ($Attempt = 1; $Attempt -le 10; $Attempt++) {
        $Result = Test-OllamaApi $Origin
        if ($Result.Ok) { break }
        Start-Sleep -Seconds 1
    }

    if ($Result.Ok) {
        Write-Host "API connection: PASS" -ForegroundColor Green
        if ($Result.AllowedOrigin -eq $Origin -or $Result.AllowedOrigin -eq '*') {
            Write-Host "Browser origin/CORS: PASS ($($Result.AllowedOrigin))" -ForegroundColor Green
        } else {
            Write-Host "Browser origin/CORS: CHECK REQUIRED" -ForegroundColor Yellow
            Write-Host "Returned Access-Control-Allow-Origin: $($Result.AllowedOrigin)"
        }
        try {
            $Tags = $Result.Body | ConvertFrom-Json
            if (@($Tags.models).Count -gt 0) {
                Write-Host ""
                Write-Host "Installed models:"
                foreach ($Model in @($Tags.models)) { Write-Host "  - $($Model.name)" }
            } else {
                Write-Host "No Ollama models are currently installed." -ForegroundColor Yellow
            }
        } catch { }
    } else {
        Write-Host "API connection: FAILED" -ForegroundColor Red
        Write-Host $Result.Error
        Write-Host "Open Ollama from the Start menu and use Test Connection in NotebookLMPlus."
    }
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "NotebookLMPlus site: $SiteUrl"
Write-Host "Trusted origin:       $Origin"
Write-Host "Ollama endpoint:      http://127.0.0.1:11434"
Write-Host ""
Write-Host "Next: open NotebookLMPlus -> Ollama Configuration -> Test connection."
Write-Host "Your browser may still show its own local-network permission prompt; approve it for your trusted site."
Write-Host ""
Read-Host "Press Enter to close"
