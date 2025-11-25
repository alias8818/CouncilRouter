# AI Council Proxy - Deployment Guide

## Overview

This guide covers deploying the AI Council Proxy system to production environments, including Docker deployment, environment configuration, database setup, and scaling considerations.

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- PostgreSQL 14+ (or use Docker)
- Redis 7+ (or use Docker)
- Node.js 18+ (for local development)
- OpenRouter API key (unified access to 300+ models)

## Quick Start with Docker Compose

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/ai-council-proxy.git
cd ai-council-proxy

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 2. Configure Environment Variables

Edit `.env` file:

```bash
# Database
DATABASE_URL=postgresql://postgres:password@postgres:5432/ai_council_proxy
REDIS_URL=redis://redis:6379

# Provider API Keys
# REQUIRED: OpenRouter API key (get at https://openrouter.ai/keys)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Server
PORT=3000
ADMIN_PORT=3001
NODE_ENV=production

# Authentication
JWT_SECRET=your-secure-random-secret-here
API_KEY_SALT=your-secure-random-salt-here

# Performance
GLOBAL_TIMEOUT_SECONDS=60
ENABLE_STREAMING=true
ENABLE_METRICS_TRACKING=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### 3. Start Services

```bash
# Build and start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Verify services are running
docker-compose ps
```

### 4. Initialize Database

```bash
# Run database migrations
docker-compose exec app npm run db:migrate

# Or manually
docker-compose exec postgres psql -U postgres -d ai_council_proxy -f /app/database/schema.sql
```

### 5. Verify Deployment

```bash
# Health check
curl http://localhost:3000/health

# Test API
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello, world!"}'
```

---

## Docker Configuration

### Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY database ./database

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/database ./database

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:14-alpine
    container_name: ai-council-postgres
    environment:
      POSTGRES_DB: ai_council_proxy
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: ai-council-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # AI Council Proxy Application
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ai-council-app
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-password}@postgres:5432/ai_council_proxy
      REDIS_URL: redis://redis:6379
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}
      PORT: 3000
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
      API_KEY_SALT: ${API_KEY_SALT}
      GLOBAL_TIMEOUT_SECONDS: ${GLOBAL_TIMEOUT_SECONDS:-60}
      ENABLE_STREAMING: ${ENABLE_STREAMING:-true}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      LOG_FORMAT: ${LOG_FORMAT:-json}
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      start_period: 40s
      retries: 3

  # Nginx Reverse Proxy (Optional)
  nginx:
    image: nginx:alpine
    container_name: ai-council-nginx
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

## Production Deployment

### AWS Deployment

#### Using ECS (Elastic Container Service)

1. **Build and Push Docker Image**

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t ai-council-proxy .

# Tag image
docker tag ai-council-proxy:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/ai-council-proxy:latest

# Push image
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/ai-council-proxy:latest
```

2. **Create RDS PostgreSQL Instance**

```bash
aws rds create-db-instance \
  --db-instance-identifier ai-council-db \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 14.7 \
  --master-username postgres \
  --master-user-password YOUR_PASSWORD \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-xxxxx \
  --db-subnet-group-name your-subnet-group
```

3. **Create ElastiCache Redis Cluster**

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id ai-council-redis \
  --cache-node-type cache.t3.medium \
  --engine redis \
  --num-cache-nodes 1 \
  --security-group-ids sg-xxxxx
```

4. **Create ECS Task Definition**

```json
{
  "family": "ai-council-proxy",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "ai-council-app",
      "image": "YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/ai-council-proxy:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "3000"}
      ],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:..."},
        {"name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:..."},
        {"name": "OPENAI_API_KEY", "valueFrom": "arn:aws:secretsmanager:..."},
        {"name": "ANTHROPIC_API_KEY", "valueFrom": "arn:aws:secretsmanager:..."},
        {"name": "GOOGLE_API_KEY", "valueFrom": "arn:aws:secretsmanager:..."}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ai-council-proxy",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

5. **Create ECS Service**

```bash
aws ecs create-service \
  --cluster your-cluster \
  --service-name ai-council-proxy \
  --task-definition ai-council-proxy \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=ai-council-app,containerPort=3000"
```

#### Using Lambda (Serverless)

For lower traffic scenarios, deploy as Lambda function:

```bash
# Install Serverless Framework
npm install -g serverless

# Create serverless.yml
# Deploy
serverless deploy
```

### Google Cloud Platform (GCP)

#### Using Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/ai-council-proxy

# Deploy to Cloud Run
gcloud run deploy ai-council-proxy \
  --image gcr.io/PROJECT_ID/ai-council-proxy \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=postgresql://...,REDIS_URL=redis://... \
  --set-secrets OPENAI_API_KEY=openai-key:latest,ANTHROPIC_API_KEY=anthropic-key:latest
```

### Azure

#### Using Container Instances

```bash
# Create resource group
az group create --name ai-council-rg --location eastus

# Create container instance
az container create \
  --resource-group ai-council-rg \
  --name ai-council-proxy \
  --image YOUR_REGISTRY/ai-council-proxy:latest \
  --cpu 2 \
  --memory 4 \
  --ports 3000 \
  --environment-variables \
    NODE_ENV=production \
    PORT=3000 \
  --secure-environment-variables \
    DATABASE_URL=postgresql://... \
    OPENAI_API_KEY=sk-...
```

---

## Kubernetes Deployment

### Kubernetes Manifests

**deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-council-proxy
  labels:
    app: ai-council-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-council-proxy
  template:
    metadata:
      labels:
        app: ai-council-proxy
    spec:
      containers:
      - name: app
        image: your-registry/ai-council-proxy:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ai-council-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: ai-council-secrets
              key: redis-url
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-council-secrets
              key: openai-api-key
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

**service.yaml:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ai-council-proxy
spec:
  selector:
    app: ai-council-proxy
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

**secrets.yaml:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-council-secrets
type: Opaque
stringData:
  database-url: postgresql://user:pass@host:5432/db
  redis-url: redis://host:6379
  openai-api-key: sk-...
  anthropic-api-key: sk-ant-...
  google-api-key: AIza...
```

**Deploy:**

```bash
kubectl apply -f secrets.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

---

## Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| DATABASE_URL | Yes | PostgreSQL connection string | - |
| REDIS_URL | Yes | Redis connection string | - |
| OPENAI_API_KEY | No* | OpenAI API key | - |
| ANTHROPIC_API_KEY | No* | Anthropic API key | - |
| GOOGLE_API_KEY | No* | Google API key | - |
| PORT | No | Server port | 3000 |
| NODE_ENV | No | Environment (development/production) | development |
| JWT_SECRET | Yes | JWT signing secret | - |
| API_KEY_SALT | Yes | API key hashing salt | - |
| GLOBAL_TIMEOUT_SECONDS | No | Global request timeout | 60 |
| ENABLE_STREAMING | No | Enable SSE streaming | true |
| LOG_LEVEL | No | Logging level (debug/info/warn/error) | info |
| LOG_FORMAT | No | Log format (json/text) | json |

*At least one provider API key is required

---

## Scaling Considerations

### Horizontal Scaling

The application is stateless and can be scaled horizontally:

```bash
# Docker Compose
docker-compose up -d --scale app=3

# Kubernetes
kubectl scale deployment ai-council-proxy --replicas=5

# ECS
aws ecs update-service --cluster your-cluster --service ai-council-proxy --desired-count 5
```

### Database Scaling

- Use connection pooling (configured in application)
- Consider read replicas for analytics queries
- Use RDS/Cloud SQL managed services for automatic scaling

### Redis Scaling

- Use Redis Cluster for high availability
- Consider ElastiCache/MemoryStore for managed Redis
- Implement cache warming strategies

### Load Balancing

- Use Application Load Balancer (ALB) on AWS
- Use Cloud Load Balancing on GCP
- Use Azure Load Balancer on Azure
- Configure health checks on `/health` endpoint

---

## Monitoring and Logging

### Health Check Endpoint

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "providers": {
      "openai": "healthy",
      "anthropic": "healthy",
      "google": "degraded"
    }
  }
}
```

### Logging

Logs are output in JSON format (configurable):

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00Z",
  "message": "Request processed",
  "requestId": "550e8400-...",
  "duration": 3450,
  "cost": 0.0234
}
```

### Metrics

Key metrics to monitor:

- Request rate (requests/second)
- Response latency (p50, p95, p99)
- Error rate
- Provider health status
- Cost per request
- Agreement levels
- Cache hit rate

---

## Security Best Practices

1. **Use HTTPS** - Always use TLS in production
2. **Rotate Secrets** - Regularly rotate API keys and secrets
3. **Limit Network Access** - Use security groups/firewalls
4. **Use Secrets Manager** - Store secrets in AWS Secrets Manager, GCP Secret Manager, etc.
5. **Enable Authentication** - Require API keys or JWT tokens
6. **Rate Limiting** - Implement rate limiting to prevent abuse
7. **Monitor Logs** - Set up log monitoring and alerting
8. **Regular Updates** - Keep dependencies updated
9. **Backup Database** - Regular automated backups
10. **Audit Logs** - Enable audit logging for compliance

---

## Backup and Recovery

### Database Backup

```bash
# Manual backup
docker-compose exec postgres pg_dump -U postgres ai_council_proxy > backup.sql

# Restore
docker-compose exec -T postgres psql -U postgres ai_council_proxy < backup.sql
```

### Automated Backups (AWS RDS)

```bash
aws rds modify-db-instance \
  --db-instance-identifier ai-council-db \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00"
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
docker-compose logs app

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Redis connection failed
# - Invalid API keys
```

### High Memory Usage

```bash
# Check container stats
docker stats

# Increase memory limit in docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 4G
```

### Database Connection Issues

```bash
# Test database connection
docker-compose exec postgres psql -U postgres -d ai_council_proxy -c "SELECT 1"

# Check connection string
echo $DATABASE_URL
```

---

## Support

For deployment assistance:
- Documentation: https://docs.example.com/deployment
- Support: support@example.com
- Community: https://community.example.com
