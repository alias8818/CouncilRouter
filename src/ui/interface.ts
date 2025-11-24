/**
 * User Interface
 * Provides web UI for submitting requests and viewing responses
 */

import express, { Express, Request, Response } from 'express';
import path from 'path';
import { Server } from 'http';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';

/**
 * User Interface implementation
 */
export class UserInterface {
  private app: Express;
  private server?: Server;
  private configManager: IConfigurationManager;
  private apiBaseUrl: string;

  constructor(
    configManager: IConfigurationManager,
    apiBaseUrl: string = 'http://localhost:3000'
  ) {
    this.app = express();
    this.configManager = configManager;
    this.apiBaseUrl = apiBaseUrl;

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));

    // JSON body parser
    this.app.use(express.json());
  }

  /**
   * Set up UI routes
   */
  private setupRoutes(): void {
    // Main UI page
    this.app.get('/', this.serveMainPage.bind(this));

    // API configuration endpoint for UI

    this.app.get('/api/ui/config', this.getUIConfig.bind(this));
  }

  /**
   * Serve main UI page
   */
  private async serveMainPage(req: Request, res: Response): Promise<void> {
    const html = await this.generateHTML();
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  /**
   * Get UI configuration
   */
  private async getUIConfig(req: Request, res: Response): Promise<void> {
    try {
      // Get transparency configuration
      const transparencyConfig = await this.configManager.getTransparencyConfig();

      res.json({
        transparencyEnabled: transparencyConfig.enabled,
        forcedTransparency: transparencyConfig.forcedTransparency,
        apiBaseUrl: this.apiBaseUrl
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load configuration' });
    }
  }

  /**
   * Generate HTML for the UI
   */
  private async generateHTML(): Promise<string> {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Council Proxy</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }
    
    .header p {
      font-size: 16px;
      opacity: 0.9;
    }
    
    .content {
      padding: 30px;
    }
    
    .input-section {
      margin-bottom: 30px;
    }
    
    .input-section label {
      display: block;
      font-weight: 600;
      margin-bottom: 10px;
      color: #333;
    }
    
    .input-section textarea {
      width: 100%;
      padding: 15px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      font-family: inherit;
      resize: vertical;
      min-height: 120px;
      transition: border-color 0.3s;
    }
    
    .input-section textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .button-group {
      display: flex;
      gap: 15px;
      margin-bottom: 30px;
    }
    
    button {
      padding: 15px 30px;
      font-size: 16px;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      flex: 1;
    }
    
    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }
    
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .btn-secondary {
      background: white;
      color: #667eea;
      border: 2px solid #667eea;
    }
    
    .btn-secondary:hover {
      background: #f5f7ff;
    }
    
    .response-section {
      display: none;
      margin-top: 30px;
    }
    
    .response-section.visible {
      display: block;
    }
    
    .response-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    
    .response-header h2 {
      color: #333;
      font-size: 24px;
    }
    
    .transparency-toggle {
      display: none;
    }
    
    .transparency-toggle.visible {
      display: block;
    }
    
    .response-content {
      background: #f9fafb;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    
    .deliberation-section {
      display: none;
      margin-top: 20px;
      background: #fff9e6;
      border: 2px solid #ffd700;
      border-radius: 8px;
      padding: 20px;
    }
    
    .deliberation-section.visible {
      display: block;
    }
    
    .deliberation-section h3 {
      color: #333;
      margin-bottom: 15px;
      font-size: 20px;
    }
    
    .deliberation-item {
      background: white;
      border-left: 4px solid #667eea;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 4px;
    }
    
    .deliberation-item:last-child {
      margin-bottom: 0;
    }
    
    .deliberation-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 14px;
      color: #666;
    }
    
    .council-member {
      font-weight: 600;
      color: #667eea;
    }
    
    .timestamp {
      font-style: italic;
    }
    
    .deliberation-content {
      color: #333;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .deliberation-round {
      margin-bottom: 25px;
    }
    
    .deliberation-round h4 {
      color: #667eea;
      margin-bottom: 15px;
      font-size: 18px;
      border-bottom: 2px solid #667eea;
      padding-bottom: 5px;
    }
    
    .no-deliberation {
      color: #666;
      font-style: italic;
      text-align: center;
      padding: 20px;
    }
    
    .status-message {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-weight: 500;
    }
    
    .status-processing {
      background: #e3f2fd;
      color: #1976d2;
      border: 2px solid #1976d2;
    }
    
    .status-error {
      background: #ffebee;
      color: #c62828;
      border: 2px solid #c62828;
    }
    
    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 10px;
      vertical-align: middle;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AI Council Proxy</h1>
      <p>Submit your query to receive consensus-driven AI responses</p>
    </div>
    
    <div class="content">
      <div class="input-section">
        <label for="query">Your Query</label>
        <textarea 
          id="query" 
          placeholder="Enter your question or request here..."
          aria-label="Query input"
        ></textarea>
      </div>
      
      <div class="button-group">
        <button id="submitBtn" class="btn-primary" onclick="submitRequest()">
          Submit Request
        </button>
        <button id="newRequestBtn" class="btn-secondary hidden" onclick="newRequest()">
          New Request
        </button>
      </div>
      
      <div id="statusMessage"></div>
      
      <div id="responseSection" class="response-section">
        <div class="response-header">
          <h2>Response</h2>
          <button 
            id="transparencyBtn" 
            class="btn-secondary transparency-toggle"
            onclick="toggleDeliberation()"
          >
            Show Deliberation
          </button>
        </div>
        
        <div id="responseContent" class="response-content"></div>
        
        <div id="deliberationSection" class="deliberation-section">
          <h3>Deliberation Thread</h3>
          <div id="deliberationContent"></div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    // Configuration
    let config = {
      transparencyEnabled: false,
      forcedTransparency: false,
      apiBaseUrl: '${this.apiBaseUrl}' || 'http://localhost:3000'
    };
    
    console.log('UI Config initialized:', config);
    
    // Session management
    let sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = generateUUID();
      localStorage.setItem('sessionId', sessionId);
    }
    
    // State
    let currentRequestId = null;
    let deliberationVisible = false;
    let eventSource = null;
    
    // Load UI configuration
    async function loadConfig() {
      try {
        const response = await fetch('/api/ui/config');
        const data = await response.json();
        config = { ...config, ...data };
        
        // Show transparency toggle if enabled (and not forced)
        // For now, always show the toggle so users can view deliberation
        // In production, you might want to respect config.transparencyEnabled
        if (!config.forcedTransparency) {
          document.getElementById('transparencyBtn').classList.add('visible');
        }
        
        // If forced transparency, automatically show deliberation
        if (config.forcedTransparency) {
          deliberationVisible = true;
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    }
    
    // Submit request
    async function submitRequest() {
      const query = document.getElementById('query').value.trim();
      
      if (!query) {
        showStatus('Please enter a query', 'error');
        return;
      }
      
      // Disable submit button
      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="loading"></span>Processing...';
      
      // Hide previous response
      document.getElementById('responseSection').classList.remove('visible');
      document.getElementById('deliberationSection').classList.remove('visible');
      deliberationVisible = false;
      
      try {
        // Get API key from localStorage (in production, use proper auth)
        // Default key must be at least 32 characters for production mode
        const apiKey = localStorage.getItem('apiKey') || 'demo-api-key-for-testing-purposes-only-12345678901234567890';
        
        // Submit request
        const response = await fetch(\`\${config.apiBaseUrl}/api/v1/requests\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`ApiKey \${apiKey}\`
          },
          body: JSON.stringify({
            query,
            sessionId,
            streaming: true
          })
        });
        
        if (!response.ok) {
          // Try to parse as JSON, but handle plain text errors
          let error;
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            try {
              error = await response.json();
            } catch {
              const text = await response.text();
              throw new Error(text || \`HTTP \${response.status}: \${response.statusText}\`);
            }
          } else {
            const text = await response.text();
            throw new Error(text || \`HTTP \${response.status}: \${response.statusText}\`);
          }
          throw new Error(error.error?.message || error.message || 'Request failed');
        }
        
        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          throw new Error(\`Unexpected response format: \${text.substring(0, 100)}\`);
        }
        currentRequestId = data.requestId;
        
        showStatus('Processing your request...', 'processing');
        
        // Start streaming
        startStreaming(currentRequestId);
        
      } catch (error) {
        showStatus(\`Error: \${error.message}\`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
      }
    }
    
    // Start streaming response
    function startStreaming(requestId) {
      const apiKey = localStorage.getItem('apiKey') || 'demo-api-key-for-testing-purposes-only-12345678901234567890';
      
      // Note: EventSource doesn't support custom headers, so we'll use polling instead
      // For proper SSE with auth, we'd need to use a library that supports headers
      // For now, just use polling which is more reliable
      console.log('Starting polling for request:', requestId);
      pollForResponse(requestId);
      return;
      
      // Legacy SSE code (commented out due to auth limitations)
      /*
      eventSource = new EventSource(
        \`\${config.apiBaseUrl}/api/v1/requests/\${requestId}/stream\`
      );
      
      eventSource.addEventListener('status', (e) => {
        try {
          const status = JSON.parse(e.data);
          showStatus(\`Status: \${status}\`, 'processing');
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      eventSource.addEventListener('message', (e) => {
        try {
          const content = JSON.parse(e.data);
          displayResponse(content);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      });
      
      eventSource.addEventListener('done', (e) => {
        eventSource.close();
        hideStatus();
        enableNewRequest();
      });
      
      eventSource.addEventListener('error', (e) => {
        // Don't show error immediately - let onerror handle fallback
        console.log('SSE error event received, falling back to polling');
        eventSource.close();
        pollForResponse(requestId);
      });
      
      eventSource.onerror = (error) => {
        // Fallback to polling if streaming fails
        console.log('SSE connection error, falling back to polling:', error);
        if (eventSource) {
          eventSource.close();
        }
        pollForResponse(requestId);
      };
      */
    }
    
    // Poll for response (primary method since SSE has auth limitations)
    async function pollForResponse(requestId) {
      const apiKey = localStorage.getItem('apiKey') || 'demo-api-key-for-testing-purposes-only-12345678901234567890';
      const maxAttempts = 120; // 120 seconds (2 minutes)
      let attempts = 0;
      
      const poll = async () => {
        try {
          const response = await fetch(
            \`\${config.apiBaseUrl}/api/v1/requests/\${requestId}\`,
            {
              headers: {
                'Authorization': \`ApiKey \${apiKey}\`
              }
            }
          );
          
          if (!response.ok) {
            if (response.status === 404 && attempts < 5) {
              // Request might not be created yet, wait a bit
              attempts++;
              setTimeout(poll, 500);
              return;
            }
            // Try to parse as JSON, but handle plain text errors
            const contentType = response.headers.get('content-type');
            let errorData = {};
            if (contentType && contentType.includes('application/json')) {
              try {
                errorData = await response.json();
              } catch {
                const text = await response.text();
                throw new Error(text || \`HTTP \${response.status}: \${response.statusText}\`);
              }
            } else {
              const text = await response.text();
              throw new Error(text || \`HTTP \${response.status}: \${response.statusText}\`);
            }
            throw new Error(errorData.error?.message || errorData.message || \`HTTP \${response.status}: \${response.statusText}\`);
          }
          
          // Check if response is JSON before parsing
          const contentType = response.headers.get('content-type');
          let data;
          if (contentType && contentType.includes('application/json')) {
            try {
              data = await response.json();
            } catch (parseError) {
              const text = await response.text();
              throw new Error(\`Invalid JSON response: \${text.substring(0, 100)}\`);
            }
          } else {
            const text = await response.text();
            throw new Error(\`Unexpected response format: \${text.substring(0, 100)}\`);
          }
          
          if (data.status === 'completed') {
            // Ensure currentRequestId is set before displaying response
            if (!currentRequestId) {
              currentRequestId = requestId;
            }
            console.log('Request completed, status data:', data);
            console.log('Consensus decision:', data.consensusDecision);
            console.log('Current request ID:', currentRequestId);
            displayResponse(data.consensusDecision);
            hideStatus();
            enableNewRequest();
          } else if (data.status === 'failed') {
            showStatus(\`Request failed: \${data.error || 'Unknown error'}\`, 'error');
            enableNewRequest();
          } else if (data.status === 'processing') {
            // Still processing, continue polling
            if (attempts < maxAttempts) {
              attempts++;
              // Show progress
              showStatus(\`Processing... (attempt \${attempts}/\${maxAttempts})\`, 'processing');
              setTimeout(poll, 1000);
            } else {
              showStatus('Request timeout - taking longer than expected', 'error');
              enableNewRequest();
            }
          } else {
            // Unknown status, continue polling
            if (attempts < maxAttempts) {
              attempts++;
              setTimeout(poll, 1000);
            } else {
              showStatus('Request timeout', 'error');
              enableNewRequest();
            }
          }
        } catch (error) {
          if (attempts < 5) {
            // Retry on transient errors
            attempts++;
            setTimeout(poll, 1000);
          } else {
            showStatus(\`Error: \${error.message}\`, 'error');
            enableNewRequest();
          }
        }
      };
      
      poll();
    }
    
    // Format response content for better display
    function formatResponseContent(content) {
      if (!content || typeof content !== 'string') {
        return '';
      }

      // Escape HTML to prevent XSS, then format
      const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      };

      let formatted = escapeHtml(content);

      // Convert markdown-like formatting to HTML
      // Headers: **text** -> <strong>text</strong>
      formatted = formatted.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

      // Section dividers: --- -> <hr>
      const lines = formatted.split('\\n');
      const processedLines = lines.map(line => {
        if (line.trim() === '---') {
          return '<hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">';
        }
        return line;
      });
      formatted = processedLines.join('\\n');

      // Convert line breaks
      formatted = formatted.replace(/\\n\\n/g, '</p><p style="margin: 12px 0;">');
      formatted = formatted.replace(/\\n/g, '<br>');

      // Wrap in paragraph tags
      formatted = '<p style="margin: 12px 0;">' + formatted + '</p>';

      // Clean up empty paragraphs
      formatted = formatted.replace(/<p[^>]*>\\s*<\\/p>/g, '');
      formatted = formatted.replace(/<p[^>]*>\\s*<br>\\s*<\\/p>/g, '');

      return formatted;
    }
    
    // Display response
    function displayResponse(decision) {
      console.log('=== DISPLAY RESPONSE START ===');
      console.log('displayResponse called with:', typeof decision, decision);
      console.log('currentRequestId:', currentRequestId);
      
      const responseSection = document.getElementById('responseSection');
      const responseContent = document.getElementById('responseContent');
      
      // Handle both string content and ConsensusDecision object
      let content;
      if (typeof decision === 'string') {
        content = decision;
        console.log('Decision is a string, length:', content.length);
        console.log('First 200 chars:', content.substring(0, 200));
      } else if (decision && typeof decision === 'object') {
        // Extract content from ConsensusDecision object
        content = decision.content || decision.text || JSON.stringify(decision, null, 2);
        console.log('Decision is an object, extracted content length:', content.length);
        
        // If there's additional metadata, append it
        if (decision.confidence) {
          content += \`\\n\\n[Confidence: \${decision.confidence}]\`;
        }
        if (decision.agreementLevel !== undefined) {
          content += \` [Agreement: \${(decision.agreementLevel * 100).toFixed(1)}%]\`;
        }
      } else {
        content = String(decision || 'No response received');
        console.log('Decision is other type, converted to string');
      }
      
      // Clean up content - remove deliberation text if it accidentally got included
      // Look for common deliberation markers and extract just the answer
      if (content.includes('## Deliberation Response') || content.includes('### Points of Agreement')) {
        console.warn('WARNING: Deliberation content found in response! Attempting to extract just the answer...');
        // Try to extract just the final answer (usually before deliberation markers)
        const lines = content.split('\\n');
        const answerLines = [];
        for (const line of lines) {
          if (line.includes('## Deliberation') || line.includes('### Points of Agreement')) {
            break;
          }
          answerLines.push(line);
        }
        if (answerLines.length > 0) {
          content = answerLines.join('\\n').trim();
          console.log('Extracted answer:', content);
        }
      }
      
      // Format content for better display (convert markdown-like formatting to HTML)
      const formattedContent = formatResponseContent(content);
      responseContent.innerHTML = formattedContent;
      responseSection.classList.add('visible');
      
      // Always load deliberation data when we have a request ID
      // (The UI will show/hide it based on transparency settings)
      if (currentRequestId) {
        console.log('About to load deliberation data for request:', currentRequestId);
        // Use setTimeout to ensure the response is displayed first
        setTimeout(() => {
          loadDeliberationData(currentRequestId);
        }, 100);
      } else {
        console.warn('No currentRequestId set, cannot load deliberation data');
        console.warn('Available variables:', { currentRequestId, decision });
      }
    }
    
    // Load deliberation data
    async function loadDeliberationData(requestId) {
      console.log('=== LOAD DELIBERATION DATA START ===');
      console.log('Request ID:', requestId);
      console.log('Config:', config);
      console.log('API Base URL:', config.apiBaseUrl);
      
      try {
        // Get API key from localStorage (same as other functions)
        // Use the same default key as submitRequest and pollForResponse
        const apiKey = localStorage.getItem('apiKey') || 'test-key-12345';
        console.log('Using API key:', apiKey.substring(0, 10) + '...');
        
        const url = \`\${config.apiBaseUrl}/api/v1/requests/\${requestId}/deliberation\`;
        console.log('Fetching deliberation from:', url);
        console.log('Authorization header:', \`ApiKey \${apiKey.substring(0, 10)}...\`);
        
        const response = await fetch(url, {
          headers: {
            'Authorization': \`ApiKey \${apiKey}\`
          }
        });
        
        console.log('Deliberation response status:', response.status, response.statusText);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          console.error('Failed to load deliberation data:', response.status, response.statusText);
          // Try to get error details
          try {
            const errorText = await response.text();
            console.error('Error details:', errorText.substring(0, 200));
          } catch (e) {
            console.error('Could not read error text:', e);
          }
          displayDeliberation([]);
          return;
        }
        
        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type');
        let deliberationThread;
        if (contentType && contentType.includes('application/json')) {
          try {
            deliberationThread = await response.json();
            console.log('Loaded deliberation thread:', deliberationThread);
            console.log('Rounds:', deliberationThread?.rounds?.length || 0);
          } catch (parseError) {
            console.error('Failed to parse deliberation JSON:', parseError);
            displayDeliberation([]);
            return;
          }
        } else {
          const text = await response.text();
          console.error('Unexpected deliberation response format:', text.substring(0, 100));
          displayDeliberation([]);
          return;
        }
        
        // Transform deliberation thread to display format
        const deliberationItems = [];
        if (deliberationThread && deliberationThread.rounds && Array.isArray(deliberationThread.rounds)) {
          console.log('Processing', deliberationThread.rounds.length, 'rounds');
          for (const round of deliberationThread.rounds) {
            if (round.exchanges && Array.isArray(round.exchanges)) {
              console.log('Round', round.roundNumber, 'has', round.exchanges.length, 'exchanges');
              for (const exchange of round.exchanges) {
                deliberationItems.push({
                  councilMember: exchange.councilMemberId || 'Unknown',
                  timestamp: new Date().toISOString(),
                  content: exchange.content || '',
                  roundNumber: round.roundNumber !== undefined ? round.roundNumber : 0
                });
              }
            } else {
              console.warn('Round', round.roundNumber, 'has no exchanges array');
            }
          }
        } else {
          console.warn('Deliberation thread has no rounds or rounds is not an array:', deliberationThread);
        }
        
        console.log('Transformed deliberation items:', deliberationItems.length, 'items');
        if (deliberationItems.length === 0) {
          console.warn('No deliberation items found! Raw data:', JSON.stringify(deliberationThread).substring(0, 500));
          console.warn('Deliberation thread structure:', {
            hasRounds: !!deliberationThread.rounds,
            roundsLength: deliberationThread.rounds?.length,
            roundsType: typeof deliberationThread.rounds,
            isArray: Array.isArray(deliberationThread.rounds)
          });
        } else {
          console.log('Successfully transformed deliberation items:', deliberationItems.map(i => ({
            round: i.roundNumber,
            member: i.councilMember,
            contentLength: i.content.length
          })));
        }
        displayDeliberation(deliberationItems);
      } catch (error) {
        console.error('Error loading deliberation data:', error);
        displayDeliberation([]);
      }
    }
    
    // Display deliberation
    function displayDeliberation(deliberation) {
      console.log('=== DISPLAY DELIBERATION START ===');
      console.log('Deliberation data:', deliberation);
      console.log('Is array:', Array.isArray(deliberation));
      console.log('Length:', deliberation?.length);
      
      const deliberationContent = document.getElementById('deliberationContent');
      
      if (!deliberation || deliberation.length === 0) {
        console.warn('No deliberation data to display');
        deliberationContent.innerHTML = '<p class="no-deliberation">No deliberation data available.</p>';
        return;
      }
      
      console.log('Displaying deliberation:', deliberation.length, 'items');
      
      // Group by round
      const rounds = {};
      deliberation.forEach((item, index) => {
        const roundNum = item.roundNumber !== undefined ? item.roundNumber : 0;
        console.log(\`Item \${index}: round=\${roundNum}, member=\${item.councilMember}, contentLength=\${item.content?.length || 0}\`);
        if (!rounds[roundNum]) {
          rounds[roundNum] = [];
        }
        rounds[roundNum].push(item);
      });
      
      const roundKeys = Object.keys(rounds).sort((a, b) => parseInt(a) - parseInt(b));
      console.log('Rounds found:', roundKeys);
      console.log('Rounds data:', rounds);
      
      if (roundKeys.length === 0) {
        console.error('No rounds found after grouping!');
        deliberationContent.innerHTML = '<p class="no-deliberation">No deliberation data available.</p>';
        return;
      }
      
      deliberationContent.innerHTML = roundKeys.map(roundNum => {
        const roundItems = rounds[roundNum];
        console.log(\`Rendering round \${roundNum} with \${roundItems.length} items\`);
        return \`
          <div class="deliberation-round">
            <h4>Round \${roundNum}</h4>
            \${roundItems.map(item => \`
              <div class="deliberation-item">
                <div class="deliberation-header">
                  <span class="council-member">\${escapeHtml(item.councilMember || 'Unknown')}</span>
                  <span class="timestamp">\${new Date(item.timestamp || Date.now()).toLocaleString()}</span>
                </div>
                <div class="deliberation-content">\${escapeHtml(item.content || 'No content')}</div>
              </div>
            \`).join('')}
          </div>
        \`;
      }).join('');
      
      console.log('=== DISPLAY DELIBERATION END ===');
      console.log('HTML length:', deliberationContent.innerHTML.length);
    }
    
    // Helper function to escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    // Toggle deliberation visibility
    function toggleDeliberation() {
      // Don't allow toggling if forced transparency is enabled
      if (config.forcedTransparency) {
        return;
      }
      
      const deliberationSection = document.getElementById('deliberationSection');
      const transparencyBtn = document.getElementById('transparencyBtn');
      const deliberationContent = document.getElementById('deliberationContent');
      
      deliberationVisible = !deliberationVisible;
      
      if (deliberationVisible) {
        deliberationSection.classList.add('visible');
        transparencyBtn.textContent = 'Hide Deliberation';
        // Always reload deliberation data when showing (in case it failed before)
        if (currentRequestId) {
          console.log('Toggle: Loading deliberation data for request:', currentRequestId);
          loadDeliberationData(currentRequestId);
        } else {
          console.warn('Toggle: No currentRequestId available');
        }
      } else {
        deliberationSection.classList.remove('visible');
        transparencyBtn.textContent = 'Show Deliberation';
      }
    }
    
    // Show status message
    function showStatus(message, type) {
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.className = \`status-message status-\${type}\`;
      
      if (type === 'processing') {
        statusMessage.innerHTML = \`<span class="loading"></span>\${message}\`;
      } else {
        statusMessage.textContent = message;
      }
    }
    
    // Hide status message
    function hideStatus() {
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.className = '';
      statusMessage.textContent = '';
    }
    
    // Enable new request
    function enableNewRequest() {
      const submitBtn = document.getElementById('submitBtn');
      const newRequestBtn = document.getElementById('newRequestBtn');
      
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
      newRequestBtn.classList.remove('hidden');
    }
    
    // New request
    function newRequest() {
      document.getElementById('query').value = '';
      document.getElementById('responseSection').classList.remove('visible');
      document.getElementById('deliberationSection').classList.remove('visible');
      document.getElementById('newRequestBtn').classList.add('hidden');
      hideStatus();
      currentRequestId = null;
      deliberationVisible = false;
    }
    
    // Generate UUID
    function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    
    // Initialize
    loadConfig();
  </script>
</body>
</html>
    `;
  }

  /**
   * Start the UI server
   */
  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`User Interface listening on port ${port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the UI server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          console.log('User Interface stopped');
          resolve();
        }
      });
    });
  }
}
