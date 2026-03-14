# ☁️ Cloud Shakes – Open Source Cloud Platform


[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)](https://github.com/errriikkk/Cloud-Shakes/releases)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

</div>

---

## 🚀 Installation (One Command)

```bash
curl -fsSL https://shakes.es/install | sudo bash
```

<p align="center">
  <img src="assets/install_gif.gif" alt="Cloud Shakes Installer" width="800"/>
</p>

**That's it!** The installer will guide you through a fully automated setup in just a few minutes.

### What the Installer Handles

| Component | Automated |
|-----------|-----------|
| ✅ Docker & Docker Compose | ✓ |
| ✅ PostgreSQL Database | ✓ |
| ✅ MinIO S3 Storage | ✓ |
| ✅ Frontend (Next.js) | ✓ |
| ✅ Backend API | ✓ |
| ✅ SSL/HTTPS Configuration | ✓ |
| ✅ Cloudflare Tunnel | ✓ (optional) |

---

## ✨ Why Cloud Shakes?

<p align="center">
  <img src="assets/home_gif.gif" alt="Cloud Shakes Interface" width="800"/>
</p>

### 🎯 Incredibly Easy

- **Single command** installation – no manual setup required
- **Interactive wizard** guides you through every step
- **Auto-generates** secure credentials for you
- **Zero configuration** – works out of the box

### 🔒 Enterprise-Grade Security

- **JWT Authentication** with secure token management
- **Rate Limiting** on all critical endpoints
- **Input Validation** with Zod
- **CSP & Helmet** security headers
- **File Type Validation** & filename sanitization
- **Audit Logs** for all administrative actions

### ⚡ Modern Architecture

- **Next.js 15** with App Router for blazing-fast frontend
- **REST API** with Express.js & TypeScript
- **PostgreSQL** with Prisma ORM for reliable data storage
- **MinIO** (S3-compatible) for scalable object storage
- **Docker** containerization for easy deployment

---

## 📊 Cloud Shakes vs Nextcloud Advanced

| Feature | Cloud Shakes | Nextcloud Advanced |
|---------|:------------:|:------------------:|
| **Installation** | `curl -fsSL https://shakes.es/install | sudo bash` | Manual Docker/VM setup required |
| **Setup Time** | ~5 minutes | ~1-2 hours |
| **One-Click Deploy** | ✅ | ❌ |
| **Modern UI** | ✅ Next.js 15 + Tailwind | ⚠️ PHP-based |
| **S3 Storage** | ✅ Native MinIO | ⚠️ External required |
| **API-First** | ✅ Full REST API | ⚠️ Limited |
| **TypeScript** | ✅ Full TypeScript | ❌ PHP |
| **Docker Native** | ✅ Optimized images | ⚠️ Community images |
| **Responsive Design** | ✅ Mobile-first | ✅ |
| **File Preview** | ✅ Integrated | ✅ |
| **Shared Links** | ✅ Secure + expirable | ✅ |
| **Search** | ✅ Advanced | ✅ |
| **Calendar** | ✅ Integrated | ✅ |
| **Notes** | ✅ Integrated | ⚠️ App required |
| **Usage Stats** | ✅ Real-time | ⚠️ App required |
| **Open Source** | ✅ MIT License | ✅ AGPL |
| **Self-Hosted** | ✅ 100% | ✅ 100% |

### Key Advantages

- **10x Faster Installation** – One command vs hours of manual work
- **Modern Stack** – TypeScript, Next.js, Prisma vs legacy PHP
- **Built-in S3** – No external storage configuration needed
- **API-First Design** – Perfect for integrations and custom clients

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 15** – App Router, React Server Components
- **TypeScript** – Full type safety
- **Tailwind CSS** – Modern utility-first styling
- **Framer Motion** – Smooth animations
- **Lucide React** – Consistent icon set
- **Axios** – HTTP client

### Backend
- **Node.js** + Express 4
- **TypeScript** – Type-safe backend
- **Prisma** – Modern ORM
- **PostgreSQL** – Production database
- **JWT** – Secure authentication
- **Multer** – File uploads
- **Helmet** – Security headers

### Infrastructure
- **Docker** + Docker Compose
- **MinIO** – S3-compatible storage
- **Cloudflare Tunnel** – Optional no-port-forwarding

---

## 📖 Quick Start

### Prerequisites
- Ubuntu/Debian, CentOS/RHEL, or Arch Linux
- Root access
- Internet connection

### Installation

```bash
# One command to rule them all
curl -fsSL https://shakes.es/install | sudo bash
```

The installer will ask you a few questions:
1. **Language** – English or Español
2. **Installation directory** – Default: `/opt/cloud-shakes`
3. **Admin credentials** – Auto-generated if left blank
4. **Ports** – Customize or use defaults (9090/5000/9000)
5. **Network mode** – Local, Public IP, or Cloudflare Tunnel

That's it! 🎉

---

## 🔧 Manual Installation (Advanced)

If you prefer manual setup:

```bash
# 1. Clone the repository
git clone https://github.com/errriikkk/Cloud-Shakes.git
cd Cloud-Shakes

# 2. Backend
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials

npm install
npm run db:generate
npm run db:migrate
npm run dev

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL

npm install
npm run dev
```

---

## 🌐 Access URLs

After installation, access your cloud:

| Service | URL |
|---------|-----|
| **Frontend** | `http://localhost:9090` |
| **API** | `http://localhost:5000` |
| **MinIO Console** | `http://localhost:9001` |

---

## 🔐 Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/shakes
JWT_SECRET=your-secret-key
UPLOAD_DIR=/data/uploads
ALLOWED_ORIGINS=http://localhost:9090
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## 🐳 Docker Deployment

```bash
# Using the installer (recommended)
curl -fsSL https://shakes.es/install | sudo bash

# Or manually with docker-compose
docker-compose up -d
```

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License with commercial restrictions. See [LICENSE](LICENSE) file.

### Usage Terms
- ✅ Personal and internal organizational use
- ✅ Modifying for internal use
- ❌ Reselling or redistributing as a standalone product
- ❌ Removing copyright notices

---

## 🔗 Links

| Resource | URL |
|----------|-----|
| 🌐 **Website** | [shakes.es](https://shakes.es) |
| 📚 **Documentation** | [docs.shakes.es](https://docs.shakes.es) |
| 🎥 **Video** | [Presentation](https://youtu.be/q5rOE5Qmwqs) |
| 🐛 **Issues** | [GitHub Issues](https://github.com/errriikkk/Cloud-Shakes/issues) |

---

<div align="center">

**Built with ❤️ by the open-source community**

</div>
