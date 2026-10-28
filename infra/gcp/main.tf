# RENOVISION AI — Google Cloud infrastructure (PREPARED, NOT APPLIED).
# Founder authorization is required before any `terraform apply`. Nothing in
# this directory provisions resources by itself. Least-privilege design:
# a dedicated runtime service account may read/write ONLY the evidence bucket;
# uniform bucket-level access with public access prevention enforced.
terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_service_account" "renovision_runtime" {
  account_id   = "renovision-runtime"
  display_name = "RENOVISION runtime (evidence bucket only)"
}

# Customer-managed encryption for evidence at rest (CMEK).
resource "google_kms_key_ring" "renovision" {
  name     = "renovision"
  location = var.region
}

resource "google_kms_crypto_key" "evidence" {
  name            = "renovision-evidence"
  key_ring        = google_kms_key_ring.renovision.id
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = false # staging teardown must be possible; set true for production by founder decision
  }
}

resource "google_project_service_identity" "storage" {
  provider = google-beta
  service  = "storage.googleapis.com"
}

resource "google_kms_crypto_key_iam_member" "storage_cmek" {
  crypto_key_id = google_kms_crypto_key.evidence.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_project_service_identity.storage.email}"
}

resource "google_storage_bucket" "evidence" {
  name                        = var.evidence_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  encryption {
    default_kms_key_name = google_kms_crypto_key.evidence.id
  }

  versioning {
    enabled = true
  }

  # Mirrors the adapter retention behavior: objects also carry per-object
  # retention metadata; this lifecycle rule is the backstop.
  lifecycle_rule {
    condition {
      age = var.evidence_retention_days
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "runtime_object_admin" {
  bucket = google_storage_bucket.evidence.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.renovision_runtime.email}"
}

resource "google_cloud_run_v2_service" "renovision" {
  name     = "renovision"
  location = var.region
  # Default restricts traffic to internal + load balancer paths; the service's
  # own verified-token authentication remains the application boundary.
  ingress = var.run_ingress

  template {
    service_account = google_service_account.renovision_runtime.email
    scaling {
      min_instance_count = 0 # scale to zero when idle — staging cost safeguard
      max_instance_count = var.max_instances
    }
    containers {
      image = var.container_image
      env {
        name  = "RENOVISION_GCS_BUCKET"
        value = google_storage_bucket.evidence.name
      }
      env {
        name  = "RENOVISION_TOKEN_ISSUER"
        value = var.token_issuer
      }
      env {
        name  = "RENOVISION_TOKEN_AUDIENCE"
        value = var.token_audience
      }
      env {
        name  = "RENOVISION_JWKS_URL"
        value = var.jwks_url
      }
      # Demo auth is never set in deployed environments; the process refuses
      # to start without verified-token configuration.
    }
  }
}
