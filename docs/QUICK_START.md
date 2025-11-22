# AI Council Proxy - Quick Start Guide

Get the AI Council Proxy running in 5 minutes!

## Prerequisites

- Docker and Docker Compose installed
- At least one AI provider API key (OpenAI, Anthropic, or Google)

## Step 1: Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/ai-council-proxy.git
cd ai-council-proxy

# Copy environment template
cp .env.example .env
```

## Step 2: Add Your API Keys

Edit `.env` and add at least one API key:

```bash
# Add at least one of these:
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
GOOGLE_API_KEY=AIza-your-google-key-here

# Generate secure secrets (or use these for testing only)
JWT_SECRET=your-secure-random-secret-here
API_KEY_SALT=your-secure-random-salt-here
```

**Generate secure secrets:**
```bash
# On Linux/Mac:
openssl rand -base64 32

# On Windows (PowerShell):
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Step 3: Start the System

```bash
# Start all services (PostgreSQL, Redis, Application)
docker-compose up -d

# Check if services are running
docker-compose ps

# View logs
docker-compose logs -f app
```

## Step 4: Verify It's Working

```bash
# Check health endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "healthy",
#   "services": {
#     "database": "healthy",
#     "redis": "healthy",
#     "providers": { ... }
#   }
# }
```

## Step 5: Make Your First Request

### Using curl:

```bash
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the key differences between TypeScript and JavaScript?"
  }'
```

**Response:**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing"
}
```

### Get the response:

```bash
curl http://localhost:3000/api/v1/requests/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "consensusDecision": "TypeScript is a superset of JavaScript that adds static typing...",
  "confidence": "high",
  "agreementLevel": 0.92,
  "cost": 0.0234,
  "latency": 3450
}
```

## Step 6: Try Different Configurations

### Fast Council (Quick Responses)

Edit your configuration to use fast models with no deliberation:

```json
{
  "council": {
    "members": [
      {"id": "gpt-3.5", "provider": "openai", "model": "gpt-3.5-turbo"},
      {"id": "gemini", "provider": "google", "model": "gemini-pro"}
    ]
  },
  "deliberation": {
    "rounds": 0
  }
}
```

**Cost**: ~$0.003 per request  
**Latency**: 2-5 seconds

### Balanced Council (Recommended)

```json
{
  "council": {
    "members": [
      {"id": "gpt4", "provider": "openai", "model": "gpt-4-turbo-preview"},
      {"id": "claude", "provider": "anthropic", "model": "claude-3-sonnet"},
      {"id": "gemini", "provider": "google", "model": "gemini-pro"}
    ]
  },
  "deliberation": {
    "rounds": 1
  }
}
```

**Cost**: ~$0.03 per request  
**Latency**: 5-15 seconds

### Research Council (Highest Quality)

```json
{
  "council": {
    "members": [
      {"id": "gpt4", "provider": "openai", "model": "gpt-4-turbo-preview"},
      {"id": "claude-opus", "provider": "anthropic", "model": "claude-3-opus"},
      {"id": "claude-sonnet", "provider": "anthropic", "model": "claude-3-sonnet"},
      {"id": "gemini", "provider": "google", "model": "gemini-pro"}
    ]
  },
  "deliberation": {
    "rounds": 4
  }
}
```

**Cost**: ~$0.20 per request  
**Latency**: 20-60 seconds

## Common Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Just the application
docker-compose logs -f app

# Just the database
docker-compose logs -f postgres
```

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart just the application
docker-compose restart app
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

### Access Database

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d ai_council_proxy

# List tables
\dt

# Query requests
SELECT id, status, created_at FROM requests ORDER BY created_at DESC LIMIT 10;

# Exit
\q
```

### Access Redis

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Check keys
KEYS *

# Get session
GET session:your-session-id

# Exit
EXIT
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs for errors
docker-compose logs

# Common issues:
# - Port 3000, 5432, or 6379 already in use
# - Missing environment variables
# - Invalid API keys
```

### Database Connection Failed

```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Provider Errors

```bash
# Check health endpoint
curl http://localhost:3000/health

# Verify API keys in .env
cat .env | grep API_KEY

# Check application logs
docker-compose logs app | grep ERROR
```

### High Latency

- Reduce deliberation rounds (set to 0 or 1)
- Use faster models (gpt-3.5-turbo, gemini-pro)
- Increase timeout values
- Check provider status pages

### High Costs

- Use cheaper models (gpt-3.5-turbo instead of gpt-4)
- Reduce deliberation rounds
- Set cost alerts
- Monitor cost per request

## Next Steps

### Learn More

- **[API Documentation](API_DOCUMENTATION.md)** - Complete API reference
- **[Configuration Guide](CONFIGURATION_GUIDE.md)** - Detailed configuration options
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Production deployment
- **[Monitoring Guide](MONITORING_GUIDE.md)** - Set up monitoring and alerts

### Customize Your Setup

1. **Configure Council Members** - Add or remove AI models
2. **Set Deliberation Rounds** - Balance quality vs speed
3. **Choose Synthesis Strategy** - Consensus, weighted, or meta-synthesis
4. **Set Up Monitoring** - Grafana dashboards and alerts
5. **Enable Transparency Mode** - Show deliberation details to users

### Production Deployment

When ready for production:

1. Follow the [Deployment Guide](DEPLOYMENT_GUIDE.md)
2. Set up proper database backups
3. Configure monitoring and alerting
4. Use strong secrets (not the test ones)
5. Enable HTTPS
6. Set up proper authentication

## Example Use Cases

### Customer Support Bot

```json
{
  "council": {
    "members": [
      {"id": "gpt4", "provider": "openai", "model": "gpt-4-turbo-preview"},
      {"id": "claude", "provider": "anthropic", "model": "claude-3-sonnet"}
    ]
  },
  "deliberation": {"rounds": 1},
  "synthesis": {"strategy": {"type": "consensus-extraction"}}
}
```

### Research Assistant

```json
{
  "council": {
    "members": [
      {"id": "gpt4", "provider": "openai", "model": "gpt-4-turbo-preview"},
      {"id": "claude-opus", "provider": "anthropic", "model": "claude-3-opus"},
      {"id": "gemini", "provider": "google", "model": "gemini-pro"}
    ]
  },
  "deliberation": {"rounds": 3},
  "synthesis": {"strategy": {"type": "meta-synthesis", "moderatorStrategy": {"type": "strongest"}}}
}
```

### Quick Q&A

```json
{
  "council": {
    "members": [
      {"id": "gpt-3.5", "provider": "openai", "model": "gpt-3.5-turbo"},
      {"id": "gemini", "provider": "google", "model": "gemini-pro"}
    ]
  },
  "deliberation": {"rounds": 0},
  "synthesis": {"strategy": {"type": "consensus-extraction"}}
}
```

## SDK Examples

### Node.js / TypeScript

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api/v1';
const API_KEY = 'YOUR_API_KEY';

async function askCouncil(query: string) {
  // Submit request
  const { data: submitResponse } = await axios.post(
    `${API_BASE}/requests`,
    { query },
    { headers: { 'Authorization': `Bearer ${API_KEY}` } }
  );
  
  const requestId = submitResponse.requestId;
  console.log('Request submitted:', requestId);
  
  // Poll for completion
  let result;
  do {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const { data } = await axios.get(
      `${API_BASE}/requests/${requestId}`,
      { headers: { 'Authorization': `Bearer ${API_KEY}` } }
    );
    result = data;
    console.log('Status:', result.status);
  } while (result.status === 'processing');
  
  return result;
}

// Usage
askCouncil('What is quantum computing?')
  .then(result => {
    console.log('Response:', result.consensusDecision);
    console.log('Cost:', result.cost);
    console.log('Agreement:', result.agreementLevel);
  });
```

### Python

```python
import requests
import time

API_BASE = 'http://localhost:3000/api/v1'
API_KEY = 'YOUR_API_KEY'

def ask_council(query):
    # Submit request
    response = requests.post(
        f'{API_BASE}/requests',
        json={'query': query},
        headers={'Authorization': f'Bearer {API_KEY}'}
    )
    request_id = response.json()['requestId']
    print(f'Request submitted: {request_id}')
    
    # Poll for completion
    while True:
        time.sleep(1)
        response = requests.get(
            f'{API_BASE}/requests/{request_id}',
            headers={'Authorization': f'Bearer {API_KEY}'}
        )
        result = response.json()
        print(f"Status: {result['status']}")
        
        if result['status'] != 'processing':
            break
    
    return result

# Usage
result = ask_council('What is quantum computing?')
print(f"Response: {result['consensusDecision']}")
print(f"Cost: ${result['cost']}")
print(f"Agreement: {result['agreementLevel']}")
```

## Support

- **Documentation**: [docs/INDEX.md](INDEX.md)
- **Issues**: https://github.com/your-org/ai-council-proxy/issues
- **Community**: https://community.example.com

---

**Ready to dive deeper?** Check out the [full documentation](INDEX.md) for advanced features and production deployment.
