# RENOVISION-KMS-ROUTING-DIAG.ps1 (v1)
# READ-ONLY root-cause diagnostic for the KMS project-routing anomaly.
# Observed on DESKTOP-5E83JLJ: with core/project = ocg-pipeline and an
# explicit --project=ocg-pipeline flag, a KMS describe returned
# SERVICE_DISABLED naming ocg-media-acceptance. Hypothesis under test:
# the error names the API CONSUMER / QUOTA project (billing/quota_project
# property, CLOUDSDK_BILLING_QUOTA_PROJECT / GOOGLE_CLOUD_QUOTA_PROJECT
# env, or the ADC quota_project_id), which the desktop's OCG MEDIA
# acceptance work (2026-10-28, project ocg-media-acceptance) plausibly
# left set - NOT the requested resource project. Falsifiable prediction:
# with the quota project pinned to ocg-pipeline for this session only,
# the identical describe returns SERVICE_DISABLED naming ocg-pipeline
# (cloudkms is disabled there too). If it still names
# ocg-media-acceptance, the ADC quota_project_id printed below is the
# next suspect. No config is modified; overrides are session-scoped
# environment variables only. No API is enabled. Nothing is created.

$ErrorActionPreference = "Continue"
$Project = "ocg-pipeline"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TranscriptPath = "$HOME\renovision-kms-diag-$Stamp.txt"
Start-Transcript -Path $TranscriptPath -Force | Out-Null
Write-Output "RENOVISION-KMS-DIAG-BEGIN $Stamp  Machine: $env:COMPUTERNAME"

function Cap {
    param([string]$Label, [string]$Exe, [string[]]$CmdArgs)
    Write-Output ""
    Write-Output "--- $Label"
    Write-Output "CMD: $Exe $($CmdArgs -join ' ')"
    $ErrFile = [System.IO.Path]::GetTempFileName()
    $Out = & $Exe @CmdArgs 2>$ErrFile
    $Code = $LASTEXITCODE
    if ($Out) { $Out | ForEach-Object { Write-Output $_ } }
    $ErrText = ""
    if (Test-Path $ErrFile) {
        $ErrText = (Get-Content $ErrFile -Raw)
        if ($ErrText) { $ErrText.TrimEnd() -split "`n" | ForEach-Object { Write-Output "stderr: $_" } }
        Remove-Item $ErrFile -Force -ErrorAction SilentlyContinue
    }
    Write-Output "EXIT: $Code"
    return (($Out | Out-String) + $ErrText)
}

Write-Output ""
Write-Output "===== AMBIENT ROUTING STATE ====="
foreach ($V in @("CLOUDSDK_CORE_PROJECT","CLOUDSDK_BILLING_QUOTA_PROJECT","GOOGLE_CLOUD_PROJECT","GOOGLE_CLOUD_QUOTA_PROJECT","CLOUDSDK_ACTIVE_CONFIG_NAME")) {
    $Val = [Environment]::GetEnvironmentVariable($V)
    if (-not $Val) { $Val = "(unset)" }
    Write-Output "env $V = $Val"
}
Cap "configurations list" "gcloud" @("config","configurations","list") | Out-Null
Cap "active configuration" "gcloud" @("config","configurations","describe-active") | Out-Null
Cap "full config list" "gcloud" @("config","list") | Out-Null
Cap "billing/quota_project property" "gcloud" @("config","get-value","billing/quota_project") | Out-Null
$AdcPath = "$env:APPDATA\gcloud\application_default_credentials.json"
if (Test-Path $AdcPath) {
    try {
        $Adc = Get-Content $AdcPath -Raw | ConvertFrom-Json
        Write-Output "ADC file: type=$($Adc.type) quota_project_id=$($Adc.quota_project_id)"
    } catch { Write-Output "ADC file: present but unreadable as JSON" }
} else { Write-Output "ADC file: absent (gcloud user credentials in use)" }

Write-Output ""
Write-Output "===== STAGING API ENABLEMENT IN $Project ====="
$Enabled = & gcloud services list --enabled --project $Project --format="value(config.name)" 2>$null
foreach ($Api in @("run.googleapis.com","cloudkms.googleapis.com","artifactregistry.googleapis.com","iam.googleapis.com","storage.googleapis.com","cloudbuild.googleapis.com","identitytoolkit.googleapis.com","serviceusage.googleapis.com")) {
    if ($Enabled -contains $Api) { Write-Output "$Api = ENABLED" } else { Write-Output "$Api = NOT ENABLED" }
}

$DescribeArgs = @("kms","keyrings","describe","renovision","--project=$Project","--location=us-central1","--format=json","--quiet")
Write-Output ""
Write-Output "===== PROBE A - AS OBSERVED (ambient routing) ====="
$A = Cap "kms describe (ambient)" "gcloud" $DescribeArgs
if ($A -match "projects/([a-z0-9-]+)") { Write-Output "PROBE A consumer project: $($Matches[1])" }

Write-Output ""
Write-Output "===== PROBE B - QUOTA PROJECT PINNED TO $Project (session only) ====="
$env:CLOUDSDK_BILLING_QUOTA_PROJECT = $Project
$B = Cap "kms describe (quota pinned)" "gcloud" $DescribeArgs
if ($B -match "projects/([a-z0-9-]+)") { Write-Output "PROBE B consumer project: $($Matches[1])" }

Write-Output ""
Write-Output "===== PROBE C - CORE + QUOTA PINNED (session only) ====="
$env:CLOUDSDK_CORE_PROJECT = $Project
$C = Cap "kms describe (core+quota pinned)" "gcloud" $DescribeArgs
if ($C -match "projects/([a-z0-9-]+)") { Write-Output "PROBE C consumer project: $($Matches[1])" }

Write-Output ""
Write-Output "===== READING THE RESULT ====="
Write-Output "If PROBE B or C names $Project: routing CONFIRMED - the SERVICE_DISABLED"
Write-Output "consumer follows the quota project; the original anomaly was the"
Write-Output "ambient quota project (ocg-media-acceptance), not resource routing."
Write-Output "cloudkms is disabled in $Project as well, so key-ring absence stays"
Write-Output "UNKNOWN until enablement is separately authorized."
Write-Output "If B and C still name ocg-media-acceptance: inspect the ADC"
Write-Output "quota_project_id and quota property lines above - the override lives"
Write-Output "in the credential/configuration layer, and this transcript is the"
Write-Output "evidence for the follow-up."
Write-Output ""
Write-Output "RENOVISION-KMS-DIAG-END"
Write-Output "Transcript: $TranscriptPath"
Stop-Transcript | Out-Null
