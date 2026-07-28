param(
  [int]$MaxAttempts = 12,
  [int]$RetryDelaySeconds = 120
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$promptPath = Join-Path $projectRoot "docs\implementation\d1-platform-project-foundation.prompt.md"
$runtimeLogRoot = Join-Path ([IO.Path]::GetTempPath()) "min-xingji-claude-code"

if (-not (Test-Path -LiteralPath $promptPath)) {
  throw "Claude Code prompt was not found: $promptPath"
}

Set-Location -LiteralPath $projectRoot
$prompt = Get-Content -LiteralPath $promptPath -Raw
New-Item -ItemType Directory -Path $runtimeLogRoot -Force | Out-Null

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
  $attemptLog = Join-Path $runtimeLogRoot (
    "d1-attempt-{0:D2}-{1}.log" -f $attempt, (Get-Date -Format "yyyyMMdd-HHmmss")
  )
  Write-Host ""
  Write-Host "Claude Code D1 attempt $attempt of $MaxAttempts"
  Write-Host "Using the existing global Claude Code configuration."
  Write-Host "Runtime log: $attemptLog"

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & claude -p $prompt `
    --permission-mode acceptEdits `
    --effort max `
    --model "claude-opus-5[1M]" `
    --max-turns 40 `
    --output-format json 2>&1 |
    Tee-Object -FilePath $attemptLog
  $claudeExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  $claudeResult = $null
  $attemptOutput = Get-Content -LiteralPath $attemptLog -Raw
  $resultMatch = [regex]::Match(
    $attemptOutput,
    '(?m)^\{"type":"result".*$'
  )
  if ($resultMatch.Success) {
    try {
      $claudeResult = $resultMatch.Value | ConvertFrom-Json
    } catch {
      Write-Warning "Claude Code result JSON could not be parsed."
    }
  }
  $claudeReportedError = (
    $null -eq $claudeResult -or
    $claudeResult.is_error -eq $true
  )
  $platformProjectWritten = Select-String `
    -LiteralPath "prisma\schema.prisma" `
    -Pattern "^model PlatformProject \{" `
    -Quiet

  Write-Host "Claude Code exit code: $claudeExitCode"
  Write-Host "Claude Code reported an error: $claudeReportedError"
  git status --short

  if ($platformProjectWritten) {
    Write-Host "PlatformProject changes detected. Stopping for supervisor review."
    exit $claudeExitCode
  }

  if ($claudeExitCode -eq 0 -and -not $claudeReportedError) {
    Write-Host "Claude Code completed without the expected schema marker. Stopping for supervisor review."
    exit 0
  }

  if ($attempt -lt $MaxAttempts) {
    $backoffSeconds = [Math]::Min(
      900,
      [int]($RetryDelaySeconds * [Math]::Pow(2, $attempt - 1))
    )
    Write-Host "Attempt failed. Waiting $backoffSeconds seconds before a fresh Claude Code session."
    Start-Sleep -Seconds $backoffSeconds
  }
}

Write-Host "All Claude Code attempts failed without writing PlatformProject."
exit 1
