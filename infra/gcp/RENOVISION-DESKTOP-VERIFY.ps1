# RENOVISION-DESKTOP-VERIFY.ps1
# Strictly READ-ONLY verification for RENOVISION staging readiness.
# Runs on the founder's authenticated Windows desktop (DESKTOP-5E83JLJ).
# It never creates, modifies, or deletes any Google Cloud resource.
# It never runs an apply operation. It writes only local files:
# a transcript and local Terraform working files.
#
# Expected identity: account gocasiorealtor@gmail.com, project ocg-pipeline.
# The script ABORTS before any inventory command if either differs.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\RENOVISION-DESKTOP-VERIFY.ps1 [-RepoPath C:\path\to\RENO]
# If Terraform 1.9.8 is not on PATH, the inventory still runs and the
# Terraform section reports TERRAFORM-NOT-FOUND with install guidance.
# Workstation parser/execution status: NOT VERIFIED until the returned
# transcript is reviewed by the requesting lane.

param(
    [string]$RepoPath = "$HOME\RENO"
)

$ExpectedAccount = "gocasiorealtor@gmail.com"
$ExpectedProject = "ocg-pipeline"
$Region = "us-central1"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TranscriptPath = "$HOME\renovision-verify-$Stamp.txt"

Start-Transcript -Path $TranscriptPath -Force | Out-Null
Write-Output "RENOVISION-VERIFY-BEGIN $Stamp"
Write-Output "Machine: $env:COMPUTERNAME  User: $env:USERNAME"

function Section($Name) { Write-Output ""; Write-Output "===== $Name =====" }
function Run($Label, $Cmd) {
    Write-Output ""
    Write-Output "--- $Label"
    Write-Output "CMD: $Cmd"
    try {
        Invoke-Expression $Cmd 2>&1 | ForEach-Object { Write-Output $_ }
    } catch {
        Write-Output "ERROR: $($_.Exception.Message)"
    }
}

# ---------- Gate: identity ----------
Section "GATE - ACTIVE IDENTITY AND PROJECT"
$Account = (& gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null)
$Project = (& gcloud config get-value project 2>$null)
Write-Output "Active account: $Account"
Write-Output "Active project: $Project"
if ($Account -ne $ExpectedAccount -or $Project -ne $ExpectedProject) {
    Write-Output "ABORT: identity mismatch. Expected account $ExpectedAccount and project $ExpectedProject."
    Write-Output "RENOVISION-VERIFY-END (ABORTED)"
    Stop-Transcript | Out-Null
    exit 1
}
Write-Output "GATE PASS"

# ---------- 1-2. Project and billing ----------
Section "1-2 PROJECT AND BILLING (billing account id intentionally not printed)"
Run "project describe" "gcloud projects describe $ExpectedProject --format='value(name,projectId,projectNumber,lifecycleState)'"
Run "billing enabled only" "gcloud billing projects describe $ExpectedProject --format='value(billingEnabled)'"

# ---------- 3. Enabled APIs ----------
Section "3 ENABLED APIS"
Run "enabled services" "gcloud services list --enabled --project $ExpectedProject --format='value(config.name)'"

# ---------- 4. Cloud Run ----------
Section "4 CLOUD RUN SERVICES"
Run "run services us-central1" "gcloud run services list --project $ExpectedProject --region $Region --format='table(metadata.name,status.url,status.conditions[0].status)'"
Run "run services all regions" "gcloud run services list --project $ExpectedProject --format='value(metadata.name,metadata.annotations.\"serving.knative.dev/creator\")'"

# ---------- 5. Storage buckets ----------
Section "5 STORAGE BUCKETS (names and locations only)"
Run "buckets" "gcloud storage buckets list --project $ExpectedProject --format='value(name,location)'"

# ---------- 6. Artifact Registry ----------
Section "6 ARTIFACT REGISTRY REPOSITORIES"
Run "ar repos" "gcloud artifacts repositories list --project $ExpectedProject --location $Region --format='value(name,format)'"

# ---------- 7. KMS ----------
Section "7 KMS KEY RINGS AND KEYS (names only)"
Run "keyrings us-central1" "gcloud kms keyrings list --project $ExpectedProject --location $Region --format='value(name)'"
Run "keyrings global" "gcloud kms keyrings list --project $ExpectedProject --location global --format='value(name)'"

# ---------- 8. Service accounts and IAM ----------
Section "8 SERVICE ACCOUNTS AND PROJECT IAM"
Run "service accounts" "gcloud iam service-accounts list --project $ExpectedProject --format='value(email,disabled)'"
Run "project iam bindings" "gcloud projects get-iam-policy $ExpectedProject --flatten='bindings[].members' --format='table(bindings.role,bindings.members)'"

# ---------- 9. Secrets (names only, values never read) ----------
Section "9 SECRETS (names only)"
Run "secret names" "gcloud secrets list --project $ExpectedProject --format='value(name)'"

# ---------- 10. RENOVISION collision probes (NOT_FOUND is the expected result) ----------
Section "10 RENOVISION COLLISION PROBES (NOT_FOUND expected for all four)"
Run "run service renovision" "gcloud run services describe renovision --project $ExpectedProject --region $Region --format='value(metadata.name)'"
Run "bucket ocg-renovision-evidence-staging" "gcloud storage buckets describe gs://ocg-renovision-evidence-staging --format='value(name)'"
Run "sa renovision-runtime" "gcloud iam service-accounts describe renovision-runtime@$ExpectedProject.iam.gserviceaccount.com --format='value(email)'"
Run "kms keyring renovision" "gcloud kms keyrings describe renovision --project $ExpectedProject --location $Region --format='value(name)'"

# ---------- 11-12. Budgets and region ----------
Section "11-12 BUDGETS AND REGION CONTEXT"
Run "billing budgets (names and amounts only)" "gcloud billing budgets list --billing-account=`$(gcloud billing projects describe $ExpectedProject --format='value(billingAccountName)' | Split-Path -Leaf) --format='value(displayName,amount.specifiedAmount.units)' 2>`$null"
Write-Output "Target region for RENOVISION staging: $Region"

# ---------- Terraform: fmt / validate / AUTHENTICATED PLAN (no apply) ----------
Section "TERRAFORM - FMT, VALIDATE, AUTHENTICATED PLAN (READ-ONLY)"
$Tf = Get-Command terraform -ErrorAction SilentlyContinue
if (-not $Tf) {
    Write-Output "TERRAFORM-NOT-FOUND: install Terraform 1.9.8 from https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_windows_amd64.zip , add it to PATH, and re-run this script. Inventory above is complete; the authenticated plan is still outstanding."
} elseif (-not (Test-Path "$RepoPath\infra\gcp\main.tf")) {
    Write-Output "REPO-NOT-FOUND: clone TheOCGroup/RENO and pass -RepoPath, then re-run. Authenticated plan still outstanding."
} else {
    $TfDir = "$RepoPath\infra\gcp"
    Write-Output "Terraform: $(& terraform version | Select-Object -First 1)"
    Push-Location $TfDir
    $Tfvars = Join-Path $TfDir "staging.tfvars"
    if (-not (Test-Path $Tfvars)) {
        Copy-Item (Join-Path $TfDir "staging.tfvars.example") $Tfvars
        Write-Output "Created local staging.tfvars from staging.tfvars.example"
    }
    Run "terraform fmt -check" "terraform fmt -check -diff"
    Run "terraform init -backend=false" "terraform init -backend=false -input=false"
    Run "terraform validate" "terraform validate"
    Write-Output ""
    Write-Output "--- terraform plan (AUTHENTICATED, READ-ONLY; expected: Plan: 8 to add, 0 to change, 0 to destroy)"
    & terraform plan -var-file="staging.tfvars" -input=false -no-color 2>&1 | ForEach-Object { Write-Output $_ }
    Pop-Location
}

Write-Output ""
Write-Output "RENOVISION-VERIFY-END"
Write-Output "Transcript: $TranscriptPath"
Stop-Transcript | Out-Null
