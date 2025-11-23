# PowerShell script to set up Docker containers for local testing
# This sets up PostgreSQL and Redis containers matching the CI test environment

Write-Host "Setting up Docker containers for testing..." -ForegroundColor Cyan

# Check if Docker is available
$dockerAvailable = $false
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0 -and $dockerVersion -notmatch "error|not recognized") {
        $dockerAvailable = $true
        Write-Host "✓ Docker is available: $dockerVersion" -ForegroundColor Green
    }
} catch {
    # Docker command might not be in PATH
}

if (-not $dockerAvailable) {
    # Try to find Docker Desktop executable
    $dockerPaths = @(
        "C:\Program Files\Docker\Docker\resources\bin\docker.exe",
        "C:\Program Files (x86)\Docker\Docker\resources\bin\docker.exe",
        "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
    )
    
    $dockerFound = $false
    foreach ($path in $dockerPaths) {
        if (Test-Path $path) {
            $env:Path += ";$(Split-Path $path -Parent)"
            try {
                $dockerVersion = docker --version 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $dockerAvailable = $true
                    $dockerFound = $true
                    Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
                    break
                }
            } catch {
                # Continue searching
            }
        }
    }
    
    if (-not $dockerAvailable) {
        Write-Host "✗ Docker is not available or Docker Desktop is not running." -ForegroundColor Red
        Write-Host "`nPlease ensure:" -ForegroundColor Yellow
        Write-Host "  1. Docker Desktop is installed" -ForegroundColor Yellow
        Write-Host "  2. Docker Desktop is running (check system tray)" -ForegroundColor Yellow
        Write-Host "  3. Docker Desktop has finished starting up" -ForegroundColor Yellow
        Write-Host "`nDownload Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
        Write-Host "`nAfter starting Docker Desktop, wait for it to fully start, then run this script again." -ForegroundColor Yellow
        exit 1
    }
}

# ============================================================================
# PostgreSQL Setup
# ============================================================================
Write-Host "`n[PostgreSQL]" -ForegroundColor Cyan

$pgContainerName = "test-postgres"
$pgContainerExists = docker ps -a --filter "name=$pgContainerName" --format "{{.Names}}"

if ($pgContainerExists -eq $pgContainerName) {
    $pgRunning = docker ps --filter "name=$pgContainerName" --format "{{.Names}}"
    if ($pgRunning -eq $pgContainerName) {
        Write-Host "✓ PostgreSQL container '$pgContainerName' is already running" -ForegroundColor Green
    } else {
        Write-Host "Starting existing PostgreSQL container..." -ForegroundColor Yellow
        docker start $pgContainerName
        Start-Sleep -Seconds 2
    }
} else {
    Write-Host "Creating PostgreSQL container..." -ForegroundColor Yellow
    docker run -d `
        --name $pgContainerName `
        -e POSTGRES_DB=test `
        -e POSTGRES_USER=postgres `
        -e POSTGRES_PASSWORD=postgres `
        -p 5432:5432 `
        postgres:14-alpine
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed to create PostgreSQL container" -ForegroundColor Red
        exit 1
    }
}

# Wait for PostgreSQL to be ready
Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$pgReady = $false

do {
    Start-Sleep -Seconds 2
    $attempt++
    try {
        $result = docker exec $pgContainerName pg_isready -U postgres 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ PostgreSQL is ready!" -ForegroundColor Green
            $pgReady = $true
            break
        }
    } catch {
        # Continue waiting
    }
    Write-Host "  Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
} while ($attempt -lt $maxAttempts)

if (-not $pgReady) {
    Write-Host "✗ PostgreSQL failed to start within timeout" -ForegroundColor Red
    exit 1
}

# ============================================================================
# Redis Setup
# ============================================================================
Write-Host "`n[Redis]" -ForegroundColor Cyan

$redisContainerName = "test-redis"
$redisContainerExists = docker ps -a --filter "name=$redisContainerName" --format "{{.Names}}"

if ($redisContainerExists -eq $redisContainerName) {
    $redisRunning = docker ps --filter "name=$redisContainerName" --format "{{.Names}}"
    if ($redisRunning -eq $redisContainerName) {
        Write-Host "✓ Redis container '$redisContainerName' is already running" -ForegroundColor Green
    } else {
        Write-Host "Starting existing Redis container..." -ForegroundColor Yellow
        docker start $redisContainerName
        Start-Sleep -Seconds 2
    }
} else {
    Write-Host "Creating Redis container..." -ForegroundColor Yellow
    docker run -d `
        --name $redisContainerName `
        -p 6379:6379 `
        redis:7-alpine
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed to create Redis container" -ForegroundColor Red
        exit 1
    }
}

# Wait for Redis to be ready
Write-Host "Waiting for Redis to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$redisReady = $false

do {
    Start-Sleep -Seconds 2
    $attempt++
    try {
        $result = docker exec $redisContainerName redis-cli ping 2>$null
        if ($result -eq "PONG") {
            Write-Host "✓ Redis is ready!" -ForegroundColor Green
            $redisReady = $true
            break
        }
    } catch {
        # Continue waiting
    }
    Write-Host "  Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
} while ($attempt -lt $maxAttempts)

if (-not $redisReady) {
    Write-Host "✗ Redis failed to start within timeout" -ForegroundColor Red
    exit 1
}

# ============================================================================
# Summary
# ============================================================================
Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "✓ Docker containers are ready for testing!" -ForegroundColor Green
Write-Host ("=" * 60) -ForegroundColor Cyan

Write-Host "`nContainer Status:" -ForegroundColor Cyan
docker ps --filter "name=test-postgres|test-redis" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host "`nConnection Details:" -ForegroundColor Cyan
Write-Host "  PostgreSQL: postgresql://postgres:postgres@localhost:5432/test" -ForegroundColor White
Write-Host "  Redis:      redis://localhost:6379" -ForegroundColor White

Write-Host "`nEnvironment Variables (for .env or export):" -ForegroundColor Cyan
Write-Host "  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/test" -ForegroundColor White
Write-Host "  REDIS_URL=redis://localhost:6379" -ForegroundColor White

Write-Host "`nUseful Commands:" -ForegroundColor Cyan
Write-Host "  Stop containers:  docker stop test-postgres test-redis" -ForegroundColor Gray
Write-Host "  Start containers: docker start test-postgres test-redis" -ForegroundColor Gray
Write-Host "  Remove containers: docker rm -f test-postgres test-redis" -ForegroundColor Gray
Write-Host "  View logs:        docker logs test-postgres  (or test-redis)" -ForegroundColor Gray

Write-Host "`n" -ForegroundColor White

