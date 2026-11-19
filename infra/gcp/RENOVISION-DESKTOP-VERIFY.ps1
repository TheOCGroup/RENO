# RENOVISION-DESKTOP-VERIFY.ps1 (v2.2)
# Strictly READ-ONLY verification for RENOVISION staging readiness.
# Runs on the founder's authenticated Windows desktop (DESKTOP-5E83JLJ).
# It never creates, modifies, or deletes any Google Cloud resource.
# It never enables an API: prompts are disabled for the whole session,
# so a disabled API returns an error instead of offering to enable it.
# It never runs an apply operation. Local writes only: a transcript,
# a local staging.tfvars (created from the committed example), and
# local Terraform working files.
#
# v2.2 changes vs v2.1: the session pinning also locks the API
# consumer/quota project (CLOUDSDK_BILLING_QUOTA_PROJECT) to the target
# project - a KMS describe with an explicit --project flag was observed
# returning SERVICE_DISABLED for a DIFFERENT project (the ambient quota
# project left by another product's acceptance work); diagnostics print
# the ambient quota property and related env vars before pinning.
# v2 changes vs v1: no dynamic command execution (direct calls with
# argument arrays); project routing PINNED via CLOUDSDK_CORE_PROJECT
# plus explicit --project flags on every call; per-command exit codes
# recorded; collision probes classified PASS (absent) / FAIL (exists) /
# UNKNOWN (permission denied or API disabled proves NOTHING about
# existence); a routing-diagnostics section runs first so any future
# project mismatch is explained by the transcript itself.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\RENOVISION-DESKTOP-VERIFY.ps1 [-RepoPath C:\path\to\RENO]
# Workstation parser/execution status: NOT VERIFIED until the returned
# transcript is reviewed by the requesting lane.

param(
    [string]$RepoPath = "$HOME\RENO"
)

$ErrorActionPreference = "Continue"
$ExpectedAccount = "gocasiorealtor@gmail.com"
$ExpectedProject = "ocg-pipeline"
$Region = "us-central1"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TranscriptPath = "$HOME\renovision-verify-$Stamp.txt"
$script:Results = @()
$script:ProbeOutcomes = @()

Start-Transcript -Path $TranscriptPath -Force | Out-Null
Write-Output "RENOVISION-VERIFY-BEGIN v2.2 $Stamp"
Write-Output "Machine: $env:COMPUTERNAME  User: $env:USERNAME"

function Section($Name) { Write-Output ""; Write-Output "===== $Name =====" }

function Invoke-Cap {
    param([string]$Label, [string]$Exe, [string[]]$CmdArgs, [switch]$HideArgs, [switch]$HideOutput)
    Write-Output ""
    Write-Output "--- $Label"
    if ($HideArgs) { Write-Output "CMD: $Exe (arguments withheld: billing scope)" }
    else { Write-Output "CMD: $Exe $($CmdArgs -join ' ')" }
    $ErrFile = [System.IO.Path]::GetTempFileName()
    $Out = & $Exe @CmdArgs 2>$ErrFile
    $Code = $LASTEXITCODE
    if ($HideOutput) { Write-Output "(output withheld: billing scope - the billing account identifier is never written to the transcript)" }
    elseif ($Out) { $Out | ForEach-Object { Write-Output $_ } }
    $ErrText = ""
    if (Test-Path $ErrFile) {
        $ErrText = (Get-Content $ErrFile -Raw)
        if ($ErrText) { $ErrText.TrimEnd() -split "`n" | ForEach-Object { Write-Output "stderr: $_" } }
        Remove-Item $ErrFile -Force -ErrorAction SilentlyContinue
    }
    Write-Output "EXIT: $Code"
    $script:Results += "$Label => exit $Code"
    return @{ Code = $Code; Text = (($Out | Out-String) + $ErrText) }
}

function Probe {
    param([string]$Label, [string[]]$CmdArgs)
    $R = Invoke-Cap $Label "gcloud" $CmdArgs
    $Outcome = ""
    if ($R.Code -eq 0) {
        $Outcome = "FAIL (resource EXISTS - collision)"
    } elseif ($R.Text -match "PERMISSION_DENIED|SERVICE_DISABLED|has not been used|not been used|API .* not enabled|not authorized|Forbidden") {
        $Outcome = "UNKNOWN (access denied or API disabled - absence NOT proven)"
    } elseif ($R.Text -match "NOT_FOUND|not found|does not exist|NOT FOUND|NotFound") {
        $Outcome = "PASS (absent)"
    } else {
        $Outcome = "UNKNOWN (unclassified error, exit $($R.Code))"
    }
    Write-Output "PROBE $Label => $Outcome"
    $script:ProbeOutcomes += "$Label => $Outcome"
}

# ---------- Routing diagnostics (BEFORE pinning) ----------
Section "DIAGNOSTICS - AMBIENT ROUTING STATE (pre-pin)"
foreach ($V in @("CLOUDSDK_CORE_PROJECT","CLOUDSDK_BILLING_QUOTA_PROJECT","GOOGLE_CLOUD_PROJECT","GOOGLE_CLOUD_QUOTA_PROJECT","CLOUDSDK_ACTIVE_CONFIG_NAME","CLOUDSDK_CONFIG")) {
    $Val = [Environment]::GetEnvironmentVariable($V)
    if (-not $Val) { $Val = "(unset)" }
    Write-Output "env $V = $Val"
}
Invoke-Cap "gcloud configurations list" "gcloud" @("config","configurations","list","--format=value(name,is_active)") | Out-Null
Invoke-Cap "ambient config account" "gcloud" @("config","get-value","account") | Out-Null
Invoke-Cap "ambient config project" "gcloud" @("config","get-value","project") | Out-Null
Invoke-Cap "ambient billing/quota_project" "gcloud" @("config","get-value","billing/quota_project") | Out-Null

# ---------- Pin routing for this session ----------
Section "PINNING - SESSION ROUTING LOCKED TO $ExpectedProject"
$env:CLOUDSDK_CORE_PROJECT = $ExpectedProject
$env:CLOUDSDK_BILLING_QUOTA_PROJECT = $ExpectedProject
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = "1"
Write-Output "CLOUDSDK_CORE_PROJECT = $env:CLOUDSDK_CORE_PROJECT"
Write-Output "CLOUDSDK_BILLING_QUOTA_PROJECT = $env:CLOUDSDK_BILLING_QUOTA_PROJECT (API consumer/quota routing locked to the same project)"
Write-Output "CLOUDSDK_CORE_DISABLE_PROMPTS = 1 (API-enablement prompts cannot occur)"

# ---------- Gate ----------
Section "GATE - ACTIVE IDENTITY"
$Acct = Invoke-Cap "active account" "gcloud" @("auth","list","--filter=status:ACTIVE","--format=value(account)")
if ($Acct.Text -notmatch [regex]::Escape($ExpectedAccount)) {
    Write-Output "ABORT: active account is not $ExpectedAccount."
    Write-Output "RENOVISION-VERIFY-END (ABORTED)"
    Stop-Transcript | Out-Null
    exit 1
}
$Proj = Invoke-Cap "project describe (pinned)" "gcloud" @("projects","describe",$ExpectedProject,"--format=value(projectId,lifecycleState)")
if ($Proj.Code -ne 0) {
    Write-Output "ABORT: cannot read project $ExpectedProject under the pinned routing."
    Write-Output "RENOVISION-VERIFY-END (ABORTED)"
    Stop-Transcript | Out-Null
    exit 1
}
Write-Output "GATE PASS (account verified; project readable under pinned routing)"

# ---------- 1-2. Billing ----------
Section "1-2 BILLING (identifier never printed)"
Invoke-Cap "billing enabled only" "gcloud" @("billing","projects","describe",$ExpectedProject,"--format=value(billingEnabled)") | Out-Null

# ---------- 3. Enabled APIs ----------
Section "3 ENABLED APIS"
Invoke-Cap "enabled services" "gcloud" @("services","list","--enabled","--project",$ExpectedProject,"--format=value(config.name)") | Out-Null

# ---------- 4. Cloud Run ----------
Section "4 CLOUD RUN SERVICES ($Region)"
Invoke-Cap "run services" "gcloud" @("run","services","list","--project",$ExpectedProject,"--region",$Region,"--format=value(metadata.name)") | Out-Null

# ---------- 5. Buckets ----------
Section "5 STORAGE BUCKETS (names and locations only)"
Invoke-Cap "buckets" "gcloud" @("storage","buckets","list","--project",$ExpectedProject,"--format=value(name,location)") | Out-Null

# ---------- 6. Artifact Registry ----------
Section "6 ARTIFACT REGISTRY REPOSITORIES ($Region)"
Invoke-Cap "ar repos" "gcloud" @("artifacts","repositories","list","--project",$ExpectedProject,"--location",$Region,"--format=value(name,format)") | Out-Null

# ---------- 7. KMS ----------
Section "7 KMS KEY RINGS ($Region + global; names only)"
Invoke-Cap "keyrings us-central1" "gcloud" @("kms","keyrings","list","--project",$ExpectedProject,"--location",$Region,"--format=value(name)") | Out-Null
Invoke-Cap "keyrings global" "gcloud" @("kms","keyrings","list","--project",$ExpectedProject,"--location","global","--format=value(name)") | Out-Null

# ---------- 8. Service accounts and IAM ----------
Section "8 SERVICE ACCOUNTS AND PROJECT IAM"
Invoke-Cap "service accounts" "gcloud" @("iam","service-accounts","list","--project",$ExpectedProject,"--format=value(email,disabled)") | Out-Null
Invoke-Cap "project iam bindings" "gcloud" @("projects","get-iam-policy",$ExpectedProject,"--flatten=bindings[].members","--format=table(bindings.role,bindings.members)") | Out-Null

# ---------- 9. Secrets ----------
Section "9 SECRETS (names only; values never read)"
Invoke-Cap "secret names" "gcloud" @("secrets","list","--project",$ExpectedProject,"--format=value(name)") | Out-Null

# ---------- 10. Collision probes ----------
Section "10 COLLISION PROBES (PASS = absent in $ExpectedProject)"
Probe "run service renovision" @("run","services","describe","renovision","--project",$ExpectedProject,"--region",$Region,"--format=value(metadata.name)")
Probe "bucket ocg-renovision-evidence-staging" @("storage","buckets","describe","gs://ocg-renovision-evidence-staging","--format=value(name)")
Probe "sa renovision-runtime" @("iam","service-accounts","describe","renovision-runtime@$ExpectedProject.iam.gserviceaccount.com","--format=value(email)")
Probe "kms keyring renovision" @("kms","keyrings","describe","renovision","--project",$ExpectedProject,"--location",$Region,"--format=value(name)")

# ---------- 11-12. Budgets ----------
Section "11-12 BUDGETS (names and amounts only) AND REGION"
$Bill = Invoke-Cap "billing account name lookup" "gcloud" @("billing","projects","describe",$ExpectedProject,"--format=value(billingAccountName)") -HideArgs -HideOutput
$BillId = ($Bill.Text.Trim() -split "/")[-1]
if ($BillId) {
    Invoke-Cap "billing budgets" "gcloud" @("billing","budgets","list","--billing-account=$BillId","--format=value(displayName,amount.specifiedAmount.units)") -HideArgs | Out-Null
} else {
    Write-Output "budgets: SKIPPED (billing account name unavailable)"
}
Write-Output "Target region for RENOVISION staging: $Region"

# ---------- Terraform ----------
Section "TERRAFORM - FMT, VALIDATE, AUTHENTICATED PLAN (READ-ONLY)"
$Tf = Get-Command terraform -ErrorAction SilentlyContinue
if (-not $Tf) {
    Write-Output "TERRAFORM-NOT-FOUND: install Terraform 1.9.8 (windows_amd64 zip SHA-256 2667de56106bc6707968286357e29c20f8dbbb2f429ef57099b04994f82d9684 from releases.hashicorp.com), verify with Get-FileHash, add to PATH, re-run. Inventory above is complete; the authenticated plan is still outstanding."
} elseif (-not (Test-Path "$RepoPath\infra\gcp\main.tf")) {
    Write-Output "REPO-NOT-FOUND: clone TheOCGroup/RENO and pass -RepoPath, then re-run. Authenticated plan still outstanding."
} else {
    $TfDir = "$RepoPath\infra\gcp"
    Write-Output "Terraform path: $($Tf.Source)"
    Push-Location $TfDir
    $Tfvars = Join-Path $TfDir "staging.tfvars"
    if (-not (Test-Path $Tfvars)) {
        Copy-Item (Join-Path $TfDir "staging.tfvars.example") $Tfvars
        Write-Output "Created local staging.tfvars from staging.tfvars.example"
    }
    Invoke-Cap "terraform version" "terraform" @("version") | Out-Null
    Invoke-Cap "terraform fmt -check" "terraform" @("fmt","-check","-diff") | Out-Null
    Invoke-Cap "terraform init -backend=false" "terraform" @("init","-backend=false","-input=false") | Out-Null
    Invoke-Cap "terraform validate" "terraform" @("validate") | Out-Null
    $Plan = Invoke-Cap "terraform plan (AUTHENTICATED, READ-ONLY; expected: 8 to add, 0 to change, 0 to destroy)" "terraform" @("plan","-var-file=staging.tfvars","-input=false","-no-color")
    $PlanLine = ($Plan.Text -split "`n" | Where-Object { $_ -match "^Plan:" } | Select-Object -First 1)
    Write-Output "PLAN SUMMARY LINE: $PlanLine"
    Pop-Location
}

# ---------- Summary ----------
Section "SUMMARY - RECORDED EXIT CODES AND PROBE OUTCOMES"
$script:Results | ForEach-Object { Write-Output "  $_" }
$script:ProbeOutcomes | ForEach-Object { Write-Output "  PROBE $_" }
Write-Output ""
Write-Output "RENOVISION-VERIFY-END"
Write-Output "Transcript: $TranscriptPath"
Stop-Transcript | Out-Null
