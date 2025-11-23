# GitHub Actions Self-Hosted Runner Setup Guide

This guide explains how to set up a self-hosted Windows runner for GitHub Actions workflows.

## Prerequisites

The workflows will automatically install dependencies if they're not present, but for best performance, you can pre-install:

### Required (will be auto-installed if missing)
- **Node.js 20+** - Will be installed automatically via winget, Chocolatey, or direct download
- **PostgreSQL 14+** OR **Docker Desktop** - For database services
- **Redis 7+** OR **Docker Desktop** - For cache services

### Recommended Pre-Installation

#### Option 1: Docker Desktop (Recommended)
Install Docker Desktop for Windows:
- Download from: https://www.docker.com/products/docker-desktop
- This allows the workflows to use containerized PostgreSQL and Redis
- Easier to manage and doesn't require separate service installations

#### Option 2: Native Services
If you prefer native Windows services:

**PostgreSQL:**
- Download from: https://www.postgresql.org/download/windows/
- Install as a Windows service
- Default port: 5432

**Redis:**
- Download from: https://github.com/microsoftarchive/redis/releases
- Or use Memurai (Redis-compatible): https://www.memurai.com/
- Install as a Windows service
- Default port: 6379

## Setting Up the Self-Hosted Runner

### 1. Install GitHub Actions Runner

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Actions** → **Runners**
3. Click **New self-hosted runner**
4. Select **Windows** and **x64**
5. Follow the instructions to download and configure the runner

### 2. Download and Configure

```powershell
# Create a folder for the runner
mkdir actions-runner
cd actions-runner

# Download the runner (use the URL from GitHub)
Invoke-WebRequest -Uri "https://github.com/YOUR-ORG/YOUR-REPO/actions/runners/downloads/latest/actions-runner-win-x64-latest.zip" -OutFile actions-runner-win-x64-latest.zip

# Extract
Expand-Archive -Path actions-runner-win-x64-latest.zip -DestinationPath .

# Configure (use the token from GitHub)
.\config.cmd --url https://github.com/YOUR-ORG/YOUR-REPO --token YOUR_TOKEN
```

### 3. Run as a Service (Optional but Recommended)

```powershell
# Install as a Windows service
.\svc.cmd install

# Start the service
.\svc.cmd start

# Check status
.\svc.cmd status
```

### 4. Verify Runner is Online

- Go to **Settings** → **Actions** → **Runners** on GitHub
- You should see your runner listed as "Online" (green)

## Workflow Behavior

The workflows will automatically:

1. **Check for Node.js** - If not found, installs via:
   - winget (Windows 10/11)
   - Chocolatey (if available)
   - Direct download and MSI installation

2. **Check for Docker** - If Docker Desktop is available:
   - Uses Docker containers for PostgreSQL and Redis
   - Creates containers named `test-postgres` and `test-redis`
   - Containers persist between runs for faster startup

3. **Check for Native Services** - If Docker is not available:
   - Looks for PostgreSQL Windows service
   - Looks for Redis Windows service
   - Starts services if they exist but are stopped

## Troubleshooting

### Node.js Installation Issues

If Node.js installation fails:
- Ensure you have administrator privileges
- Try installing manually: https://nodejs.org/
- Verify PATH environment variable includes Node.js

### Database Connection Issues

**If using Docker:**
```powershell
# Check if containers are running
docker ps

# Check container logs
docker logs test-postgres
docker logs test-redis

# Restart containers
docker restart test-postgres
docker restart test-redis
```

**If using native services:**
```powershell
# Check PostgreSQL service
Get-Service -Name "postgresql*"

# Check Redis service
Get-Service -Name "Redis*"

# Start services manually if needed
Start-Service postgresql-x64-14
Start-Service Redis
```

### Port Conflicts

If ports 5432 (PostgreSQL) or 6379 (Redis) are already in use:

1. **For Docker containers:** The workflows use fixed container names, so they'll reuse existing containers
2. **For native services:** Stop the conflicting service or change the port in the workflow environment variables

### Runner Not Picking Up Jobs

- Check runner status: `.\svc.cmd status`
- Restart runner: `.\svc.cmd stop` then `.\svc.cmd start`
- Check runner logs in the `_diag` folder
- Verify runner is online in GitHub Settings → Actions → Runners

## Security Considerations

- **Runner Access:** Self-hosted runners have access to your repository code and secrets
- **Network:** Ensure the runner machine is on a secure network
- **Updates:** Keep the runner software updated: `.\config.cmd remove` then reinstall
- **Secrets:** Never commit secrets to the repository; use GitHub Secrets

## Performance Tips

1. **Pre-install dependencies** - Faster than auto-installation
2. **Use Docker Desktop** - Easier container management
3. **Keep containers running** - Workflows reuse existing containers
4. **SSD storage** - Faster npm installs and builds
5. **Adequate RAM** - Property tests can be memory-intensive

## Workflow Files

- **`.github/workflows/test.yml`** - Main testing workflow
- **`.github/workflows/ci.yml`** - Complete CI pipeline (lint + test)

Both workflows are configured to run on `self-hosted` runners and will automatically set up all required dependencies.

