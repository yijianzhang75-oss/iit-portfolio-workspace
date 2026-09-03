# Security Policy

## Supported versions

This repository is currently an early-stage internal project demonstration. Security fixes are applied to the latest version only.

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue, discussion, screenshot, or pull request.

After the GitHub repository is created, use GitHub's **Private vulnerability reporting** feature under the repository's Security tab. Include:

- affected version or commit;
- reproduction steps;
- expected and actual behavior;
- potential impact;
- suggested mitigation, if available.

If private vulnerability reporting has not yet been enabled, contact the repository owner privately and avoid sharing exploit details publicly.

## Data-safety boundary

The public repository and its demonstrations must contain synthetic data only. Never commit or upload:

- real clinical research records, subject information, investigator information, project budgets, or internal reports;
- real names, phone numbers, email addresses, hospital or center identifiers;
- production SQLite databases, database exports, backups, attachments, imported spreadsheets, or Feishu/Base files;
- `.env` files, passwords, session secrets, server addresses, SSH keys, certificates, or cloud-console screenshots;
- production logs or screenshots containing confidential data.

When reproducing a defect, create the smallest possible synthetic dataset. Do not copy production data and then attempt to redact it.

## Deployment notice

The built-in shared-password mode is designed for a small, trusted internal network. It is not a substitute for enterprise identity management, fine-grained authorization, HTTPS, network access controls, monitoring, and regular backups. Review the deployment model before exposing the service to the public internet.
