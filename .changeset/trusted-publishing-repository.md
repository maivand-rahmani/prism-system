---
"@prism-system/ui-core": patch
"@prism-system/ui-system-a": patch
"@prism-system/ui-system-b": patch
---

Add `repository` metadata to the publishable package manifests so npm can verify the source repository when releases are published through Trusted Publishing (OIDC) from GitHub Actions.
