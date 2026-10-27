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

resource "google_storage_bucket" "evidence" {
  name                        = var.evidence_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

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
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.renovision_runtime.email
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
