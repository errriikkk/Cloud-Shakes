# Cloud Shakes

Cloud Shakes is a modern self-hosted cloud platform for teams that need ownership, performance, and control: files, folders, secure sharing, notes, documents, calendar, activity tracking, IAM roles/permissions, and advanced backup operations.

## Why Cloud Shakes

- **Self-hosted by default**: your data, your infrastructure, your compliance boundaries.
- **Modern stack**: Next.js + React frontend, Node.js + Express + Prisma backend.
- **S3-first storage model**: MinIO-native, adaptable to S3-compatible providers.
- **Enterprise controls**: RBAC, section-level permissions, 2FA, activity logs, backup workflows.
- **Operational UX**: focused on fast day-to-day work, not legacy admin panels.

## Feature Highlights

- **Cloud Drive**: folders, drag-and-drop uploads, previews, sharing, metadata per file.
- **Advanced Activity**: filterable timeline, actor/resource context, actionable audit trail.
- **Backups (Control Center)**:
  - local/S3/SSH backup strategies
  - on-demand trigger + scheduled execution
  - dry-run restore
  - restore comparison (selected backup vs latest successful snapshot + live DB indicators)
- **Security**:
  - JWT auth with secure cookies
  - optional 2FA (TOTP)
  - role-based access control
  - rate limiting + CSRF protection + security headers
- **Workspace modules**: documents, notes, links, calendar, chat, plugin runtime, low-code API flows.

## Plugin & SDK Value (Shakes SDK)

Cloud Shakes is not just "plugins enabled"; it is designed as a plugin economy:

- **Builder experience**: `@cloud-shakes/sdk` for rapid plugin authoring, local testing, packaging, and publishing.
- **Distribution model**: marketplace + local ZIP sideload for private/internal extensions.
- **Runtime model**: isolated execution with capability-gated behavior (safer than ad-hoc scripts).
- **Product integration**: plugins can extend workspace behavior (UI slots, actions, and backend execution hooks).
- **Enterprise governance**: role-based control over who can install/enable/update plugins.

Compared to Discord-style ecosystems, the goal is similar (extensible core + ecosystem effects) but focused on cloud/workspace operations rather than chat-first bots.

## Cloud Shakes vs Other Self-Hosted Options

| Capability | Cloud Shakes | Nextcloud/ownCloud | Bare S3 + custom scripts |
| --- | --- | --- | --- |
| Modern UX/UI | Strong focus | Varies by app/theme | None by default |
| S3-native architecture | Yes | Usually via external setup/plugins | Yes |
| Fine-grained RBAC | Yes | Partial/depends on edition | Custom build |
| Built-in operational panel for backups | Yes | Usually external tooling | Custom build |
| Integrated multi-module workspace | Yes | Yes | No |
| Time-to-first-deploy | Fast with installer/compose | Medium | Slow |

> Practical note: "best" depends on your priorities. Cloud Shakes is built for teams that want both product experience and infrastructure control without assembling many separate tools.

## Quick Start

### Option A: Installer

```bash
curl -fsSL https://shakes.es/install | sudo bash
```

### Option B: Docker Compose

```bash
git clone https://github.com/errriikkk/Cloud-Shakes.git
cd Cloud-Shakes
docker compose up -d --build
```

## Local Development

### Backend

```bash
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Security Posture

- Security middleware with `helmet`, CORS controls, rate-limiting, CSRF protection.
- Encrypted credentials for sensitive config fields (for example backup credentials).
- 2FA support (TOTP) for account-level hardening.
- Activity logging to improve incident response and operational traceability.
- Dependency auditing via `npm audit` workflows in backend and frontend.

## Security & Threat Model

### Threat model assumptions

- Multi-tenant workspace with authenticated users and role-based permissions.
- Public internet exposure through reverse proxy (TLS termination outside app).
- Critical assets: credentials/tokens, file objects, backups, plugin runtime integrity.
- Primary abuse scenarios: account takeover, permission bypass, unsafe restore, malicious plugin upload, API abuse.

### Security controls in place

- **Auth/session**: JWT + refresh cookies, optional TOTP 2FA, login throttling.
- **Request protection**: CSRF middleware on mutating routes, CORS allowlist, Helmet headers.
- **Authorization**: route-level RBAC via permissions (`manage_*`, `view_*`, etc.).
- **Auditability**: activity logs for key user actions.
- **Backup guardrails**: dry-run + restore comparison with risk indicators before destructive restore.

### OWASP quick checklist (critical routes)

| Area | Route group | OWASP focus | Current status |
| --- | --- | --- | --- |
| Auth | `/api/auth/*` | A07 Identification/Auth failures, A05 Security misconfiguration | Login/device flows rate-limited, random code generation hardened, 2FA available |
| Files | `/api/files/*` | A01 Broken access control, A04 Insecure design | Owner/role checks + permission guards + CSRF on mutating endpoints |
| Plugins | `/api/plugins/*` | A08 Software/data integrity failures, A01 Broken access control | Sensitive install/activate/update endpoints restricted to `manage_plugins` |
| Device auth | `/api/auth/device/*`, `/device/verify` | A03 Injection, A04 Insecure design | Code handling sanitized/encoded, rate limit added |

### Residual risk and next hardening steps

- Enforce stricter plugin provenance policy (mandatory signatures for all non-local plugins).
- Add structured security event sink (SIEM/webhook) for auth and permission-denied anomalies.
- Add periodic dependency patch window with automated CI fail gates for high/critical advisories.
- Consider optional WAF/rate policy profiles for internet-facing deployments.

## Operations and Backups

Cloud Shakes includes a dedicated backup section integrated in Settings:

- configure destinations (local, S3, SSH)
- trigger and monitor backups
- inspect logs and status
- run restore dry-run
- compare restore candidate before execution

This is designed to reduce recovery mistakes and make restore decisions explicit.

## Roadmap Direction

- stronger backup verification and artifact integrity workflows
- more advanced analytics/audit insights
- expanded plugin ecosystem
- more enterprise identity and policy integrations

## Contributing

1. Fork the repository
2. Create your branch: `git checkout -b feature/my-feature`
3. Commit your changes
4. Push branch and open a PR

For major architectural changes, open an issue first to align on scope.

## Links

- Website: [https://shakes.es](https://shakes.es)
- Documentation: [https://docs.shakes.es](https://docs.shakes.es)
- Demo: [https://demo.shakes.es](https://demo.shakes.es)
