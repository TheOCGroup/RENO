output "evidence_bucket" {
  value       = google_storage_bucket.evidence.name
  description = "Private evidence bucket name (set RENOVISION_GCS_BUCKET to this)."
}

output "runtime_service_account" {
  value       = google_service_account.renovision_runtime.email
  description = "Least-privilege runtime identity (objectAdmin on the evidence bucket only)."
}

output "service_uri" {
  value       = google_cloud_run_v2_service.renovision.uri
  description = "Cloud Run service URI once deployed."
}
