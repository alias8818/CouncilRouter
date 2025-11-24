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
      apiBaseUrl: '${this.apiBaseUrl}'
    };
    
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
        if (config.transparencyEnabled && !config.forcedTransparency) {
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
          const error = await response.json();
          throw new Error(error.error?.message || 'Request failed');
        }
        
        const data = await response.json();
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
      
      eventSource = new EventSource(
        \`\${config.apiBaseUrl}/api/v1/requests/\${requestId}/stream?apiKey=\${apiKey}\`
      );
      
      eventSource.addEventListener('status', (e) => {
        const status = JSON.parse(e.data);
        showStatus(\`Status: \${status}\`, 'processing');
      });
      
      eventSource.addEventListener('message', (e) => {
        const content = JSON.parse(e.data);
        displayResponse(content);
      });
      
      eventSource.addEventListener('done', (e) => {
        eventSource.close();
        hideStatus();
        enableNewRequest();
      });
      
      eventSource.addEventListener('error', (e) => {
        const error = e.data ? JSON.parse(e.data) : 'Streaming error';
        showStatus(\`Error: \${error}\`, 'error');
        eventSource.close();
        enableNewRequest();
      });
      
      eventSource.onerror = () => {
        // Fallback to polling if streaming fails
        eventSource.close();
        pollForResponse(requestId);
      };
    }
    
    // Poll for response (fallback)
    async function pollForResponse(requestId) {
      const apiKey = localStorage.getItem('apiKey') || 'demo-api-key-for-testing-purposes-only-12345678901234567890';
      const maxAttempts = 60; // 60 seconds
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
            throw new Error('Failed to fetch response');
          }
          
          const data = await response.json();
          
          if (data.status === 'completed') {
            displayResponse(data.consensusDecision);
            hideStatus();
            enableNewRequest();
          } else if (data.status === 'failed') {
            showStatus('Request failed', 'error');
            enableNewRequest();
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(poll, 1000);
          } else {
            showStatus('Request timeout', 'error');
            enableNewRequest();
          }
        } catch (error) {
          showStatus(\`Error: \${error.message}\`, 'error');
          enableNewRequest();
        }
      };
      
      poll();
    }
    
    // Display response
    function displayResponse(content) {
      const responseSection = document.getElementById('responseSection');
      const responseContent = document.getElementById('responseContent');
      
      responseContent.textContent = content;
      responseSection.classList.add('visible');
      
      // Load deliberation data if transparency is enabled
      if (config.transparencyEnabled && currentRequestId) {
        loadDeliberationData(currentRequestId);
        
        // If forced transparency, automatically show deliberation
        if (config.forcedTransparency) {
          const deliberationSection = document.getElementById('deliberationSection');
          deliberationSection.classList.add('visible');
          deliberationVisible = true;
        }
      }
    }
    
    // Load deliberation data
    async function loadDeliberationData(requestId) {
      // In a full implementation, this would fetch deliberation data from the API
      // For now, we'll use mock data
      const mockDeliberation = [
        {
          councilMember: 'OpenAI GPT-4',
          timestamp: new Date().toISOString(),
          content: 'Initial response from GPT-4...'
        },
        {
          councilMember: 'Anthropic Claude',
          timestamp: new Date().toISOString(),
          content: 'Initial response from Claude...'
        },
        {
          councilMember: 'Google Gemini',
          timestamp: new Date().toISOString(),
          content: 'Initial response from Gemini...'
        }
      ];
      
      displayDeliberation(mockDeliberation);
    }
    
    // Display deliberation
    function displayDeliberation(deliberation) {
      const deliberationContent = document.getElementById('deliberationContent');
      
      deliberationContent.innerHTML = deliberation.map(item => \`
        <div class="deliberation-item">
          <div class="deliberation-header">
            <span class="council-member">\${item.councilMember}</span>
            <span class="timestamp">\${new Date(item.timestamp).toLocaleString()}</span>
          </div>
          <div class="deliberation-content">\${item.content}</div>
        </div>
      \`).join('');
    }
    
    // Toggle deliberation visibility
    function toggleDeliberation() {
      // Don't allow toggling if forced transparency is enabled
      if (config.forcedTransparency) {
        return;
      }
      
      const deliberationSection = document.getElementById('deliberationSection');
      const transparencyBtn = document.getElementById('transparencyBtn');
      
      deliberationVisible = !deliberationVisible;
      
      if (deliberationVisible) {
        deliberationSection.classList.add('visible');
        transparencyBtn.textContent = 'Hide Deliberation';
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
