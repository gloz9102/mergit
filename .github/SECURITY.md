# Security Policy

## Supported versions

Security fixes are considered for the latest released version of Mergit.

## Reporting a vulnerability

Please do not open a public issue for security vulnerabilities.

Use GitHub private vulnerability reporting if it is enabled for this repository. If it is not available, contact the repository owner through a private channel and include:

- affected Mergit version
- operating system
- reproduction steps
- expected impact
- relevant logs or screenshots

## Security model

Mergit delegates authentication to the user's system git, credential helper, and SSH configuration. It should not collect or store hosted-service credentials.
