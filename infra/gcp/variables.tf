variable "project_id" {
  type        = string
  description = "GCP project that hosts RENOVISION (founder-selected)."
}

variable "region" {
  type        = string
  description = "Region for the bucket and Cloud Run service."
  default     = "us-central1"
}

variable "evidence_bucket_name" {
  type        = string
  description = "Globally unique name for the private evidence bucket."
}

variable "evidence_retention_days" {
  type        = number
  description = "Backstop lifecycle retention for evidence objects."
  default     = 365
}

variable "container_image" {
  type        = string
  description = "RENOVISION container image (built from this repository; set at deploy time)."
}

variable "token_issuer" {
  type        = string
  description = "OIDC issuer for verified ID tokens (e.g. Firebase / Google Identity Platform)."
}

variable "token_audience" {
  type        = string
  description = "Expected audience claim of ID tokens for this API."
}

variable "jwks_url" {
  type        = string
  description = "JWKS endpoint of the identity provider."
}
