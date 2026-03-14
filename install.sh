#!/bin/bash

# Cloud Shakes - One-Line Installer
# Usage: curl -fsSL https://shakes.es/install.sh | sudo bash
#
# Or download and run locally:
# wget -qO- https://shakes.es/install.sh | sudo bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
WHITE='\033[1;37m'
NC='\033[0m'

# ASCII Art
cat << 'EOF'
   ____ _     _____ ____ ____ ____  __  __
  / ___| |   |_   _|  _ \/ ___/ ___||  \/  |
 | |  _| |     | | | |_) \___ \___ \| |\/| |
 | |_| | |___  | | |  _ < ___) |__) | |  | |
  \____|_____| |_| |_| \_\____/____/|_|  |_|

EOF

echo -e "${WHITE}========================================${NC}"
echo -e "${WHITE}  Cloud Shakes - Installer${NC}"
echo -e "${WHITE}========================================${NC}"
echo ""

# Functions
log_info() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step() { echo -e "${BLUE}[→]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo ""
    log_error "This script must be run as root"
    echo ""
    echo "Usage:"
    echo "  curl -fsSL https://shakes.es/install.sh | sudo bash"
    echo ""
    exit 1
fi

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    elif [ -f /etc/redhat-release ]; then
        OS="rhel"
    elif [ -f /etc/debian_version ]; then
        OS="debian"
    else
        OS="unknown"
    fi
}

# Install Git
install_git() {
    log_step "Installing Git..."
    detect_os
    
    case $OS in
        ubuntu|debian|linuxmint)
            apt-get update -qq
            apt-get install -y -qq git >/dev/null 2>&1
            ;;
        fedora|rhel|centos)
            dnf install -y git >/dev/null 2>&1 || yum install -y git >/dev/null 2>&1
            ;;
        arch)
            pacman -Sy --noconfirm git >/dev/null 2>&1
            ;;
        *)
            log_error "Unsupported OS. Please install Git manually."
            exit 1
            ;;
    esac
    
    log_info "Git installed successfully"
}

# Install Docker
install_docker() {
    log_step "Installing Docker..."
    
    # Check if Docker is already installed
    if command -v docker &> /dev/null; then
        log_info "Docker is already installed"
        return 0
    fi
    
    detect_os
    
    case $OS in
        ubuntu|debian|linuxmint)
            # Install Docker
            apt-get update -qq
            apt-get install -y -qq ca-certificates curl gnupg lsb-release >/dev/null 2>&1
            
            # Add Docker GPG key
            mkdir -p /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
            
            # Add Docker repo
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list >/dev/null
            
            apt-get update -qq
            apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null 2>&1
            ;;
            
        fedora|rhel|centos)
            dnf install -y dnf-plugins-core >/dev/null 2>&1
            dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo >/dev/null 2>&1
            dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null 2>&1
            ;;
            
        arch)
            pacman -Sy --noconfirm docker docker-compose >/dev/null 2>&1
            ;;
    esac
    
    # Enable and start Docker
    systemctl enable docker --quiet 2>/dev/null || true
    systemctl start docker 2>/dev/null || true
    
    log_info "Docker installed successfully"
}

# Install Docker Compose (standalone)
install_docker_compose() {
    if command -v docker compose &> /dev/null; then
        return 0
    fi
    
    log_step "Installing Docker Compose..."
    
    # Get latest version
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4 | sed 's/v//')
    
    # Download
    curl -L "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    log_info "Docker Compose installed"
}

# Main installation
main() {
    echo ""
    
    # 1. Check Git
    log_step "Checking Git..."
    if ! command -v git &> /dev/null; then
        log_warn "Git not found"
        read -p "Install Git automatically? [Y/n]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            install_git
        else
            log_error "Git is required to continue"
            exit 1
        fi
    else
        log_info "Git found: $(git --version | cut -d' ' -f3)"
    fi
    
    # 2. Check Docker
    log_step "Checking Docker..."
    if ! command -v docker &> /dev/null; then
        log_warn "Docker not found"
        read -p "Install Docker automatically? [Y/n]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            install_docker
            install_docker_compose
        else
            log_error "Docker is required to continue"
            exit 1
        fi
    else
        log_info "Docker found: $(docker --version | cut -d' ' -f5 | sed 's/,//')"
    fi
    
    # 3. Check Docker Compose
    log_step "Checking Docker Compose..."
    if command -v docker compose &> /dev/null; then
        log_info "Docker Compose found"
    elif command -v docker-compose &> /dev/null; then
        log_info "Docker Compose found (standalone)"
    else
        log_warn "Docker Compose not found, installing..."
        install_docker_compose
    fi
    
    echo ""
    echo -e "${WHITE}========================================${NC}"
    echo -e "${WHITE}  Configuration${NC}"
    echo -e "${WHITE}========================================${NC}"
    echo ""
    
    # 4. Get installation directory
    read -p "Installation directory [/opt/cloud-shakes]: " INSTALL_DIR
    INSTALL_DIR=${INSTALL_DIR:-/opt/cloud-shakes}
    
    # 5. Get domain
    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    read -p "Public domain or IP [$PUBLIC_IP]: " DOMAIN
    DOMAIN=${DOMAIN:-$PUBLIC_IP}
    
    # 6. Get admin credentials
    read -p "Admin username [admin]: " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}
    
    read -p "Admin password (leave empty for auto-generate): " ADMIN_PASS
    if [ -z "$ADMIN_PASS" ]; then
        ADMIN_PASS=$(openssl rand -hex 12 2>/dev/null || head -c 24 /dev/urandom | xxd -p)
    fi
    
    echo ""
    echo -e "${WHITE}========================================${NC}"
    echo -e "${WHITE}  Installing Cloud Shakes...${NC}"
    echo -e "${WHITE}========================================${NC}"
    echo ""
    
    # 7. Clone repository
    log_step "Cloning repository..."
    if [ -d "$INSTALL_DIR/.git" ]; then
        cd "$INSTALL_DIR"
        git pull
    else
        rm -rf "$INSTALL_DIR"
        git clone https://github.com/errriikkk/Cloud-Shakes.git "$INSTALL_DIR"
    fi
    
    cd "$INSTALL_DIR"
    
    # 8. Create .env
    log_step "Creating configuration..."
    if [ ! -f ".env" ]; then
        cp .env.example .env
    fi
    
    # Generate secrets
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p)
    DB_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
    MINIO_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
    
    # Update .env
    sed -i "s|your_super_secret_jwt_key_here|$JWT_SECRET|" .env
    sed -i "s|your_admin_password|$ADMIN_PASS|" .env
    sed -i "s|your_secure_db_password|$DB_PASSWORD|" .env
    sed -i "s|your_secure_minio_password|$MINIO_PASSWORD|" .env
    sed -i "s|localhost:9090|https://$DOMAIN:9090|" .env 2>/dev/null || true
    sed -i "s|http://localhost:5000|https://$DOMAIN:5000|" .env 2>/dev/null || true
    sed -i "s|localhost|$DOMAIN|" .env 2>/dev/null || true
    
    # Update admin username
    sed -i "s|admin|$ADMIN_USER|" .env 2>/dev/null || true
    
    # 9. Build containers
    log_step "Building containers (this may take a few minutes)..."
    docker compose build
    
    # 10. Start services
    log_step "Starting services..."
    docker compose up -d
    
    # 11. Wait for services
    log_step "Waiting for services to be ready..."
    sleep 30
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${WHITE}Access URLs:${NC}"
    echo -e "  Frontend:  ${GREEN}http://$DOMAIN:9090${NC}"
    echo -e "  API:       ${GREEN}http://$DOMAIN:5000${NC}"
    echo -e "  MinIO:     ${GREEN}http://$DOMAIN:9001${NC}"
    echo ""
    echo -e "${WHITE}Credentials:${NC}"
    echo -e "  Username: ${GREEN}$ADMIN_USER${NC}"
    echo -e "  Password: ${GREEN}$ADMIN_PASS${NC}"
    echo ""
    echo -e "${WHITE}Commands:${NC}"
    echo -e "  View logs:    ${GREEN}docker compose -f $INSTALL_DIR/docker-compose.yml logs -f${NC}"
    echo -e "  Restart:      ${GREEN}docker compose -f $INSTALL_DIR/docker-compose.yml restart${NC}"
    echo -e "  Stop:         ${GREEN}docker compose -f $INSTALL_DIR/docker-compose.yml down${NC}"
    echo ""
}

# Run main
main
