# Admin Dashboard

The Admin Dashboard provides a web-based interface for monitoring and managing the AI Council Proxy system.

## Features

### Overview Tab
- **System Metrics**: Total requests, active sessions, average response time
- **Cost Tracking**: Total cost, today's cost, average cost per request
- **Performance**: Success rate, consensus rate, average deliberation rounds
- **Recent Activity**: Live feed of recent requests with status and metrics

### Providers Tab
- **Health Monitoring**: Real-time status of all AI providers (OpenAI, Anthropic, Google)
- **Performance Metrics**: Success rate, average latency, request count per provider
- **Failure Tracking**: Consecutive failure counts and warnings

### Configuration Tab
- **Preset Configurations**: Quick selection of fast-council, balanced-council, or research-council
- **Custom Settings**: 
  - Max deliberation rounds
  - Consensus threshold
  - Synthesis strategy (consensus, weighted, meta)
- **Live Updates**: Changes take effect immediately

### Analytics Tab
- **Performance Analytics**: Request volume, success rates, latency trends
- **Cost Breakdown**: Total costs, per-request costs, costs by provider and model
- **Time Range Selection**: View metrics for different time periods

### Logs Tab
- **System Events**: Real-time view of system events and errors
- **Event Types**: Request processing, consensus decisions, provider health changes
- **Detailed Data**: Full event data in JSON format

## Getting Started

### Prerequisites

- PostgreSQL database running
- Redis cache running
- AI Council Proxy configured

### Starting the Admin Dashboard

```bash
# Start the admin dashboard (runs on port 3001 by default)
npm run admin
```

The dashboard will be available at: `http://localhost:3001`

### Custom Port

Set the `ADMIN_PORT` environment variable to use a different port:

```bash
ADMIN_PORT=4000 npm run admin
```

## Architecture

The admin dashboard consists of:

1. **Backend Server** (`src/dashboard/admin-server.ts`)
   - Express server serving static files and API endpoints
   - Runs on separate port from main API (default: 3001)
   - Provides REST endpoints for dashboard data

2. **Frontend** (`src/dashboard/public/`)
   - `admin.html`: Single-page application interface
   - `admin.js`: Client-side JavaScript for data fetching and rendering
   - Auto-refreshes data every 10 seconds

3. **Dashboard Component** (`src/dashboard/dashboard.ts`)
   - Aggregates data from analytics engine, provider pool, and database
   - Provides unified interface for monitoring data

## API Endpoints

### GET /api/admin/overview
Returns system overview metrics (requests, sessions, costs, performance)

### GET /api/admin/providers
Returns health status for all providers

### GET /api/admin/activity?limit=20
Returns recent request activity

### GET /api/admin/config
Returns current council configuration

### POST /api/admin/config
Updates council configuration
```json
{
  "preset": "balanced-council",
  // OR
  "maxRounds": 3,
  "consensusThreshold": 0.7,
  "synthesisStrategy": "consensus"
}
```

### GET /api/admin/analytics/performance?days=7
Returns performance metrics for specified time range

### GET /api/admin/analytics/cost?days=7
Returns cost analytics for specified time range

### GET /api/admin/logs?limit=50
Returns recent system logs

## Security Considerations

The admin dashboard currently has no authentication. For production use:

1. Add authentication middleware to admin server
2. Use HTTPS/TLS for encrypted connections
3. Restrict access by IP address or VPN
4. Consider running on internal network only

## Development

### File Structure

```
src/dashboard/
├── admin-server.ts       # Backend Express server
├── dashboard.ts          # Dashboard data aggregation
└── public/
    ├── admin.html        # Frontend HTML
    └── admin.js          # Frontend JavaScript
```

### Adding New Features

1. Add API endpoint in `admin-server.ts`
2. Add corresponding function in `dashboard.ts` if needed
3. Update frontend in `admin.html` and `admin.js`

### Styling

The dashboard uses a dark theme with:
- Background: `#0f172a` (slate-900)
- Cards: `#1e293b` (slate-800)
- Accent: `#3b82f6` (blue-500)
- Success: `#10b981` (green-500)
- Warning: `#f59e0b` (amber-500)
- Error: `#ef4444` (red-500)

## Troubleshooting

### Dashboard won't start
- Check PostgreSQL is running: `docker ps | grep postgres`
- Check Redis is running: `docker ps | grep redis`
- Verify DATABASE_URL and REDIS_URL environment variables

### No data showing
- Ensure main API has processed some requests
- Check browser console for JavaScript errors
- Verify API endpoints are responding: `curl http://localhost:3001/api/admin/overview`

### Port already in use
- Change port: `ADMIN_PORT=4000 npm run admin`
- Or stop process using port 3001: `lsof -ti:3001 | xargs kill`

## Future Enhancements

- Real-time WebSocket updates instead of polling
- Interactive charts and graphs (Chart.js, D3.js)
- User authentication and role-based access
- Configuration history and rollback
- Alert notifications for system issues
- Export data to CSV/JSON
- Dark/light theme toggle
