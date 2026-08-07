# Security Policy

## Scope

QuestLearn is a portfolio and demonstration project. It is not deployed
for production use, handles no real student data, and processes no real
payments. That said, it's built with the same security discipline as a
production system — argon2 password hashing, tenant isolation,
authorization checks tested for cross-tenant access, and secrets kept
out of the repository — because demonstrating that discipline correctly
is part of the point of the project.

## Reporting a Vulnerability

Please report security issues privately via GitHub Security Advisories
on this repository, rather than opening a public issue.

## Supported Versions

This project does not maintain multiple release lines. Security fixes,
if any are needed, are applied to `main`.
