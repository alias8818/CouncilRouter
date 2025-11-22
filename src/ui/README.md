# User Interface

The User Interface component provides a web-based UI for interacting with the AI Council Proxy.

## Features

- **Request Submission**: Simple form for submitting queries to the AI council
- **Session Management**: Automatic session tracking across multiple requests
- **Response Display**: Clean display of consensus decisions
- **Transparency Mode**: Optional toggle to reveal deliberation threads
- **Streaming Support**: Real-time streaming of responses via Server-Sent Events (SSE)
- **Responsive Design**: Modern, gradient-based UI that works on all devices

## Architecture

The UI is implemented as a single-page application (SPA) embedded in the TypeScript server:

```
UserInterface
├── Express Server (serves HTML/CSS/JS)
├── Configuration Endpoint (/api/ui/config)
└── Main UI Page (/)
```

## Usage

### Starting the UI Server

```typescript
import { UserInterface } from './ui/interface';
import { ConfigurationManager } from './config/manager';

const ui = new UserInterface(
  configManager,
  'http://localhost:3000' // API base URL
);

await ui.start(8080);
console.log('UI available at http://localhost:8080');
```

### Configuration

The UI automatically loads configuration from the `/api/ui/config` endpoint:

```typescript
{
  transparencyEnabled: boolean,  // Show/hide transparency toggle
  apiBaseUrl: string            // Base URL for API requests
}
```

## UI Components

### Request Form
- Text area for query input
- Submit button with loading state
- Session ID automatically managed via localStorage

### Response Display
- Consensus decision shown in clean, readable format
- Transparency toggle button (when enabled)
- Deliberation thread (hidden by default)

### Deliberation Thread
- Chronologically ordered council member responses
- Council member identification
- Timestamps for each contribution
- Only visible when transparency mode is enabled and user clicks toggle

## Session Management

Sessions are automatically managed using browser localStorage:

1. On first visit, a UUID is generated and stored
2. Session ID is included with every request
3. Session persists across page reloads
4. Conversation history is maintained server-side

## Streaming

The UI supports Server-Sent Events (SSE) for real-time response streaming:

```javascript
// Automatic fallback to polling if SSE fails
eventSource = new EventSource(`${apiBaseUrl}/api/v1/requests/${requestId}/stream`);

eventSource.addEventListener('message', (e) => {
  const content = JSON.parse(e.data);
  displayResponse(content);
});
```

## Transparency Mode

When transparency mode is enabled in configuration:

1. A "Show Deliberation" button appears
2. Clicking reveals the full deliberation thread
3. All council member contributions are shown with attribution
4. Responses are displayed in chronological order

When disabled:
- Only the consensus decision is shown
- No deliberation details are visible
- Cleaner, simpler user experience

## Styling

The UI uses a modern gradient design with:
- Purple gradient header (#667eea to #764ba2)
- Clean white content area
- Smooth transitions and hover effects
- Responsive layout (max-width: 900px)
- Loading animations for processing states

## API Integration

The UI communicates with the API Gateway via:

1. **POST /api/v1/requests** - Submit new request
2. **GET /api/v1/requests/:id** - Poll for response
3. **GET /api/v1/requests/:id/stream** - Stream response (SSE)

Authentication is handled via API key stored in localStorage (in production, use proper auth).

## Testing

Property-based tests verify:

1. **Deliberation hiding by default** (Property 3)
2. **Session identifier inclusion** (Property 24)
3. **Transparency button display** (Property 40)
4. **Deliberation hiding when disabled** (Property 42)

Run tests:
```bash
npm test -- src/ui/__tests__/
```

## Example

See `src/ui/example.ts` for a complete example of starting the UI server alongside the API Gateway.

## Requirements Validated

- **1.1**: User can submit requests through the interface
- **1.4**: Consensus decision is returned to the user
- **1.5**: Deliberation process is hidden by default
- **8.1**: Session identifier is included with requests
- **12.1**: Transparency mode toggle is available when enabled
- **12.2**: Deliberation thread is displayed in chronological order
- **12.4**: Deliberation details are hidden when transparency is disabled
