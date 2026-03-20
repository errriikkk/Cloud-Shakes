<div align="center">
  <img src="assets/install_gif.gif" alt="Cloud Shakes Logo" width="140" style="border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);"/>
  <h1 align="center">☁️ Cloud Shakes</h1>
  <p align="center"><strong>The Ultra-Premium, API-First Self-Hosted Cloud Storage Architecture</strong></p>

  <p align="center">
    <a href="https://demo.shakes.es"><img src="https://img.shields.io/badge/Live_Demo-demo.shakes.es-FF004D?style=for-the-badge&logo=vercel" alt="Live Demo" /></a>
    <a href="https://shakes.es"><img src="https://img.shields.io/badge/Website-shakes.es-0F0F0F?style=for-the-badge&logo=safari" alt="Website" /></a>
    <a href="https://docs.shakes.es"><img src="https://img.shields.io/badge/Docs-docs.shakes.es-0F0F0F?style=for-the-badge&logo=gitbook" alt="Docs" /></a>
  </p>

  <p align="center">
    <a href="https://github.com/errriikkk/Cloud-Shakes/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License" /></a>
    <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=flat-square&logo=docker" alt="Docker Ready" /></a>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-15-black.svg?style=flat-square&logo=next.js" alt="Next.js" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?style=flat-square&logo=typescript" alt="TypeScript" /></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?style=flat-square&logo=tailwind-css" alt="Tailwind CSS" /></a>
  </p>
</div>

---

**Cloud Shakes** is not just another file manager. It is a completely re-engineered, enterprise-grade, **self-hosted cloud storage solution** designed for the modern web. Built specifically to replace sluggish, legacy PHP applications like Nextcloud or expensive walled gardens like Google Drive and Dropbox, Cloud Shakes offers **2025-level UX/UI**, uncompromising security, and an object-storage-first backend.

If you believe that owning your data shouldn't mean sacrificing performance or aesthetics, Cloud Shakes is built for you.

---

## ✨ Experience The Live Demo

Before deploying your own instance, feel free to try our live interactive demo. The demo environment is isolated, blazingly fast, and showcases the full scope of our glassmorphism UI.

👉 **[Launch Live Demo (demo.shakes.es)](https://demo.shakes.es)**

*(Note: Certain administrative features, system settings, and destructive actions are hard-disabled in the public demo environment for security reasons).*

---

## 🚀 The "1-Minute" Installation (Recommended)

Self-hosting complex software historically involved manually setting up databases, reverse proxies, and object storage containers. We fixed that. Cloud Shakes comes with an **interactive, bulletproof installer** that orchestrates an entire production-grade environment on your Linux server in exactly one line of code.

```bash
curl -fsSL https://shakes.es/install | sudo bash
```

<p align="center">
  <img src="assets/install_gif.gif" alt="Cloud Shakes Installer Flow" width="800" style="border-radius: 12px; border: 1px solid #333;"/>
</p>

### What happens under the hood?
1. **Dependency Engine**: The script validates that your server runs compatible versions of Docker, Docker Compose, and Git. If not, it safely installs them.
2. **Cryptographic Generation**: It generates robust, cryptographically secure random strings for your `JWT_SECRET`, PostgreSQL password, and MinIO root credentials.
3. **Environment Injection**: It asks you a few simple questions (e.g., your domain name, desired HTTP ports) and dynamically populates robust `.env` files preventing CORS and Cookie domain errors.
4. **Volume Provisioning**: It scaffolds local mapped volumes to ensure your data persists across restarts.
5. **Auto-Deployment**: It pulls the latest pre-built images or builds them locally, launching the complete stack.

---

## ⚔️ The Philosophy: Cloud Shakes vs. The Industry

Why build another cloud system? Because the self-hosted community deserves a tier-one product.

### The Problem with Incumbents
- **Nextcloud / ownCloud**: Powerful, but incredibly heavy. Built on legacy LAMP stacks (PHP/Apache), they often feel sluggish, require constant tuning, and their UI can feel dated. Searching large directories usually causes bottlenecks.
- **Dropbox / Google Drive**: Excellent speed and UX, but you pay with your privacy. Your data is mined, subjected to corporate scanning, and monthly usage fees scale poorly for large media files.

### The Cloud Shakes Advantage

| Core Metric | ☁️ Cloud Shakes | Nextcloud | S3 / Bare Metal | Dropbox / Drive |
| :--- | :--- | :--- | :--- | :--- |
| **Data Privacy** | 🟢 **100% On-Premise** | 🟢 100% On-Premise | 🟢 High | 🔴 Corporate owned |
| **Backend Arch** | 🟢 **Node.js + Prisma** | 🔴 Legacy PHP | 🟡 Low-level API | 🟢 Proprietary |
| **Storage Layer** | 🟢 **Native S3 (MinIO)** | 🟡 Plugin required | 🟢 Native S3 | 🟢 Proprietary |
| **UI Aesthetics** | 🟢 **Premium glassmorphism** | 🟡 Functional | 🔴 CLI/Basic | 🟢 Premium |
| **State Mgt** | 🟢 **React 19 / Next.js 15** | 🟡 jQuery / Vue mix | N/A | 🟢 React / Custom |
| **Setup Time** | 🟢 **< 2 minutes (Automated)** | 🟡 15-30 mins | 🔴 Expert required | 🟢 Instant |
| **Dark Mode** | 🟢 **Native, Dynamic** | 🟡 Basic | N/A | 🟡 Basic |

---

## 💎 Deep Dive: Core Features

<p align="center">
  <img src="assets/home_gif.gif" alt="Cloud Shakes Interface" width="800" style="border-radius: 12px; border: 1px solid #333;"/>
</p>

### 1. 📁 Advanced Storage & File Management
- **S3-First Backend Architecture**: Instead of storing files flatly on an ext4 disk which severely limits scalability, Cloud Shakes stores objects using standard S3 APIs. By default, it bundles **MinIO**, but it can effortlessly pipe to AWS S3, DigitalOcean Spaces, or Cloudflare R2 by simply changing your `.env`.
- **Intelligent Media Previews**: Native support for viewing images, reading PDFs, and editing Markdown documents inline.
- **Buffered Media Streaming**: Videos and massive audio files stream directly. The backend fully supports the `Range` HTTP header, meaning you can skip through a 4GB 4K video instantly without downloading the whole file.
- **Resilient Uploads**: Ultra-fast, chunked drag-and-drop system.

### 2. 🔗 Secure Reverse-Sharing
- **Share Links on Steroids**: Generate a public link in 1 second.
- **Granular Perimeter Security**: Need to lock it down? Add a custom password, set an automatic expiration date (e.g., "expires in 48 hours").
- **Direct Downloads**: Files are safely proxied. Anonymous users never see your actual internal S3 bucket URLs or database IDs.

### 3. 🛡️ Enterprise-Grade Security & Roles (RBAC)
- **Visual Role-Based Access Control**: Inspired by Discord's role system. Create custom roles (e.g., "Editors", "Viewers") and assign them specific permissions (Upload, Delete, Share, Manage Users).
- **Stateless Authentication**: Uses asymmetric JWT session tokens with a silent HTTP-Only cookie refresh flow. Completely immune to standard XSS token theft.
- **CSRF Protection**: Native double-submit cookie patterns for mutating requests.
- **Runtime Validation**: Everything hitting the API is validated through `Zod` schemas. Malformed payloads or path-traversal strings are stripped out before they even hit the controllers.
- **DDoS/Abuse Mitigation**: Integrated IP-based Rate Limiting on critical endpoints (login, register, share creation).

### 4. 📝 Rich Modules Built-in
More than just files:
- **Collaborative Notes**: Fully-featured Markdown note-taking synced to your cloud.
- **Event Calendar**: Keep track of events, deadlines, and shared team schedules.
- **Gallery Mode**: A specialized, visual-first grid view for organizing and sharing large photographic albums.

---

## 🏗️ Architecture Stack Explained

Cloud Shakes uses a modern, strictly-typed enterprise stack:

- **Frontend Application**
  - **Framework**: `Next.js 15` (App Router)
  - **State & UI**: `React 19`, `Framer Motion` (for 60fps micro-animations).
  - **Styling**: `Tailwind CSS v4` mapped to custom CSS variables for effortless theming.
- **Backend API Gateway**
  - **Core**: `Node.js` + `Express` (Fully written in strict TypeScript).
  - **ORM**: `Prisma ORM` for zero-bug database interaction and schema migrations.
- **Infrastructure Layer**
  - **Relational Data**: `PostgreSQL` (handles users, permissions, link metadata, file hierarchies).
  - **Object Storage**: `MinIO` (handles the actual binary blobs of the files).
  - **Containerization**: Composed via `Docker`.

---

## 🛠️ Advanced Development Setup (Manual)

If you are a contributor, want to run things natively without Docker, or want to audit the source code, here is the manual setup flow.

### Prerequisites
- Node.js >= 18
- PostgreSQL Database running locally or remotely.
- An S3 Provider (or MinIO server running locally).

### Step 1: Clone the Repository
```bash
git clone https://github.com/errriikkk/Cloud-Shakes.git
cd Cloud-Shakes
```

### Step 2: Configure the Backend API
```bash
cd backend
# Duplicate the example environment file
cp .env.example .env

# Edit .env with your local PostgreSQL and MinIO credentials:
# DATABASE_URL="postgresql://user:password@localhost:5432/cloudshakes"
# JWT_SECRET="your_very_long_random_string_here"
# MINIO_ENDPOINT="localhost"
# MINIO_PORT="9000"
# MINIO_ROOT_USER="..."
```

Install packages and push the DB schema:
```bash
npm install
npm run db:generate   # Generates the Prisma client
npm run db:migrate    # Pushes tables to PostgreSQL
npm run dev           # Starts the Express server on port 5000
```

### Step 3: Configure the Frontend Web App
Open a new terminal session.

```bash
cd ../frontend
cp .env.example .env.local

# Edit .env.local:
# NEXT_PUBLIC_API_URL="http://localhost:5000"

npm install
npm run dev           # Starts the Next.js server on port 3000
```
Navigate to `http://localhost:3000` to interact with your local development build.

---

## 🐳 Docker Compose (Manual Deployment)

If you prefer not to use our `curl` installer, you can spin up the stack manually:

1. Clone the repo.
2. Verify all `.env` files in both `frontend/` and `backend/`.
3. In the root directory (where `docker-compose.yml` is located), run:

```bash
docker-compose up -d --build
```
This will containerize the Node apps, pull PostgreSQL, pull MinIO, and link them across a shared internal Docker bridge network.

---

## 📈 Roadmap & Future Visions
We are continuously iterating. Next major milestones include:
- [ ] **E2E Encryption**: Zero-knowledge encryption (client-side encryption before S3 upload).
- [ ] **Desktop Client**: Native Rust/Tauri-based desktop syncing client.
- [ ] **Mobile App**: React Native iOS/Android app for auto-camera uploads.
- [ ] **OIDC / SSO**: Enterprise login integrations (Google Workspace, Active Directory, Authelia).
- [ ] **Webhooks**: Dispatch events to Discord/Slack on file uploads.

---

## 🤝 Community & Contributing

Cloud Shakes is fundamentally built *by* developers, *for* the open-source community. 

**Want to help out?**
1. **Fork** the repository.
2. **Branch out** (`git checkout -b feature/AmazingFeature`).
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`).
4. **Push** (`git push origin feature/AmazingFeature`).
5. **Open a PR**!

*Note: For major architectural overhauls, database changes, or massive UI redesigns, please open an **Issue** to discuss your vision with the core maintainers first!*

---

<div align="center">
  <p><strong>Driven by transparency. Built with ❤️. Maintained by the open-source community.</strong></p>
  <p>
    <a href="https://shakes.es"><strong>Website</strong></a> &nbsp;&bull;&nbsp; 
    <a href="https://docs.shakes.es"><strong>Documentation</strong></a> &nbsp;&bull;&nbsp; 
    <a href="https://github.com/errriikkk/Cloud-Shakes/issues"><strong>Report an Issue</strong></a>
  </p>
</div>
