#!/usr/bin/env pwsh
# Full Docker Rebuild Script
# Stops containers, rebuilds images with no cache, and starts containers

Write-Host "=== Docker Full Rebuild Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop and remove containers
Write-Host "[1/4] Stopping Docker containers..." -ForegroundColor Yellow
docker-compose down
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: docker-compose down failed (containers may not have been running)" -ForegroundColor Yellow
}

# Step 2: Remove old images (optional but ensures clean rebuild)
Write-Host "[2/4] Removing old images..." -ForegroundColor Yellow
docker-compose rm -f
docker rmi councilrouter-api councilrouter-ui 2>$null
Write-Host "Old images removed (if they existed)" -ForegroundColor Green

# Step 3: Rebuild images with no cache
Write-Host "[3/4] Rebuilding Docker images with no cache..." -ForegroundColor Yellow
docker-compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Images rebuilt successfully!" -ForegroundColor Green

# Step 4: Start containers
Write-Host "[4/4] Starting Docker containers..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to start containers!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Rebuild Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Containers are starting up. Check status with:" -ForegroundColor Cyan
Write-Host "  docker-compose ps" -ForegroundColor White
Write-Host ""
Write-Host "View logs with:" -ForegroundColor Cyan
Write-Host "  docker-compose logs -f" -ForegroundColor White
Write-Host ""

