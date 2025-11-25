/**
 * User Interface for AI Council Proxy
 * Aurora Dark Theme with Glassmorphism
 */

import express, { Express, Request, Response } from 'express';
import { Server } from 'http';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';

/**
 * User Interface class for the AI Council Proxy
 * Provides a modern web interface for submitting queries and viewing results
 */
export class UserInterface {
  private app: Express;
  private server: Server | null = null;
  private configManager: IConfigurationManager;
  private apiBaseUrl: string;

  constructor(configManager: IConfigurationManager, apiBaseUrl?: string) {
    this.configManager = configManager;
    this.apiBaseUrl = apiBaseUrl || 'http://localhost:3000';
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    this.app.get('/', (req: Request, res: Response) => this.serveMainPage(req, res));
    this.app.get('/api/ui/config', (req: Request, res: Response) => this.getUIConfig(req, res));
  }

  /**
   * Serve the main page
   */
  private async serveMainPage(_req: Request, res: Response): Promise<void> {
    const html = await this.generateHTML();
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  /**
   * Get UI configuration
   */
  private async getUIConfig(_req: Request, res: Response): Promise<void> {
    try {
      const transparencyConfig = await this.configManager.getTransparencyConfig();
      res.json({
        transparencyEnabled: transparencyConfig.enabled,
        forcedTransparency: transparencyConfig.forcedTransparency,
        apiBaseUrl: this.apiBaseUrl
      });
    } catch (_error) {
      res.json({
        transparencyEnabled: false,
        forcedTransparency: false,
        apiBaseUrl: this.apiBaseUrl,
        error: 'Failed to load config'
      });
    }
  }

  /**
   * Generate the main HTML page with Aurora theme
   */
  private async generateHTML(): Promise<string> {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Council Proxy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #050508;
      --bg-secondary: #0a0a10;
      --bg-tertiary: #10101a;
      --bg-card: rgba(16, 16, 26, 0.6);
      --bg-card-hover: rgba(20, 20, 35, 0.8);
      --glass-border: rgba(255, 255, 255, 0.08);
      --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      --accent-cyan: #00d4ff;
      --accent-purple: #a855f7;
      --accent-pink: #ec4899;
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --text-primary: #f0f0f5;
      --text-secondary: #a0a0b0;
      --text-muted: #606070;
      --gradient-aurora: linear-gradient(135deg, #00d4ff 0%, #a855f7 50%, #ec4899 100%);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 20px;
      --radius-xl: 28px;
      --transition-fast: 0.15s ease;
      --transition-medium: 0.3s ease;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      overflow-x: hidden;
      line-height: 1.6;
    }

    .aurora-bg {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }

    .aurora-bg::before {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background:
        radial-gradient(ellipse at 20% 20%, rgba(0, 212, 255, 0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(168, 85, 247, 0.12) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(16, 185, 129, 0.08) 0%, transparent 50%);
      animation: aurora-drift 20s ease-in-out infinite;
    }

    @keyframes aurora-drift {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(2%, 1%) rotate(1deg); }
      50% { transform: translate(-1%, 2%) rotate(-1deg); }
      75% { transform: translate(-2%, -1%) rotate(0.5deg); }
    }

    .particles {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 1;
    }

    .particle {
      position: absolute;
      width: 4px; height: 4px;
      background: var(--accent-cyan);
      border-radius: 50%;
      opacity: 0.3;
      animation: particle-float 15s ease-in-out infinite;
    }

    .particle:nth-child(2) { left: 20%; top: 30%; background: var(--accent-purple); animation-delay: -3s; animation-duration: 18s; }
    .particle:nth-child(3) { left: 80%; top: 20%; background: var(--accent-pink); animation-delay: -6s; animation-duration: 12s; }
    .particle:nth-child(4) { left: 60%; top: 70%; background: var(--accent-emerald); animation-delay: -9s; animation-duration: 20s; }
    .particle:nth-child(5) { left: 10%; top: 80%; background: var(--accent-cyan); animation-delay: -12s; animation-duration: 16s; }

    @keyframes particle-float {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
      50% { transform: translate(100px, -100px) scale(1.5); opacity: 0.6; }
    }

    .container {
      position: relative;
      z-index: 10;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .glass-card {
      background: var(--bg-card);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-xl);
      box-shadow: var(--glass-shadow);
      overflow: hidden;
      transition: all var(--transition-medium);
    }

    .glass-card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(255, 255, 255, 0.12);
    }

    .header {
      text-align: center;
      padding: 50px 40px;
      position: relative;
      overflow: hidden;
    }

    .header::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: var(--gradient-aurora);
      opacity: 0.8;
    }

    .logo-container {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 80px; height: 80px;
      background: var(--gradient-aurora);
      border-radius: 24px;
      margin-bottom: 24px;
      position: relative;
      box-shadow: 0 0 40px rgba(0, 212, 255, 0.3);
    }

    .logo-container::after {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 26px;
      background: var(--gradient-aurora);
      z-index: -1;
      opacity: 0.5;
      filter: blur(10px);
    }

    .logo-icon { font-size: 36px; }

    .header h1 {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: var(--gradient-aurora);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 12px;
    }

    .header p {
      font-size: 16px;
      color: var(--text-secondary);
      max-width: 400px;
      margin: 0 auto;
    }

    .content { padding: 40px; }

    .input-section { margin-bottom: 32px; }

    .input-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .input-label-icon {
      width: 18px; height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--gradient-aurora);
      border-radius: 6px;
      font-size: 10px;
    }

    .textarea-wrapper {
      position: relative;
      border-radius: var(--radius-lg);
      padding: 2px;
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.3) 0%, rgba(168, 85, 247, 0.3) 50%, rgba(236, 72, 153, 0.3) 100%);
      transition: all var(--transition-medium);
    }

    .textarea-wrapper:focus-within {
      background: var(--gradient-aurora);
      box-shadow: 0 0 30px rgba(0, 212, 255, 0.2);
    }

    .query-textarea {
      width: 100%;
      min-height: 140px;
      padding: 20px;
      background: var(--bg-secondary);
      border: none;
      border-radius: calc(var(--radius-lg) - 2px);
      font-family: inherit;
      font-size: 16px;
      color: var(--text-primary);
      resize: vertical;
      transition: all var(--transition-medium);
    }

    .query-textarea::placeholder { color: var(--text-muted); }
    .query-textarea:focus { outline: none; background: var(--bg-tertiary); }

    .button-group {
      display: flex;
      gap: 16px;
      margin-bottom: 32px;
    }

    .btn {
      position: relative;
      padding: 16px 32px;
      font-family: inherit;
      font-size: 15px;
      font-weight: 600;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-medium);
      overflow: hidden;
    }

    .btn-primary {
      flex: 1;
      background: var(--gradient-aurora);
      color: white;
      box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
    }

    .btn-primary::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%);
      opacity: 0;
      transition: opacity var(--transition-fast);
    }

    .btn-primary:hover::before { opacity: 1; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0, 212, 255, 0.4); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

    .btn-secondary {
      background: transparent;
      color: var(--text-primary);
      border: 2px solid var(--glass-border);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .spinner {
      display: inline-block;
      width: 18px; height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 10px;
      vertical-align: middle;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .status-message {
      padding: 16px 20px;
      border-radius: var(--radius-md);
      margin-bottom: 24px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slide-in 0.3s ease;
    }

    @keyframes slide-in {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .status-processing {
      background: rgba(0, 212, 255, 0.1);
      border: 1px solid rgba(0, 212, 255, 0.3);
      color: var(--accent-cyan);
    }

    .status-error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--accent-red);
    }

    .response-section {
      display: none;
      margin-top: 32px;
      animation: fade-in 0.5s ease;
    }

    .response-section.visible { display: block; }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .response-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .response-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .response-title h2 {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .response-badge {
      padding: 4px 12px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-emerald);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .transparency-toggle { display: none; }
    .transparency-toggle.visible { display: block; }

    .response-content {
      background: var(--bg-secondary);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      padding: 24px;
      color: var(--text-primary);
      line-height: 1.8;
      font-size: 15px;
    }

    .response-content p { margin-bottom: 16px; }
    .response-content p:last-child { margin-bottom: 0; }
    .response-content hr { border: none; border-top: 1px solid var(--glass-border); margin: 24px 0; }
    .response-content strong { color: var(--accent-cyan); font-weight: 600; }

    .consensus-metadata-section { display: none; margin-top: 24px; }
    .consensus-metadata-section.visible { display: block; }

    .consensus-metadata {
      background: var(--bg-secondary);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      padding: 24px;
    }

    .consensus-metadata h4 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .consensus-metadata h4::before { content: '📊'; }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .metadata-item {
      background: var(--bg-tertiary);
      padding: 16px;
      border-radius: var(--radius-md);
      border: 1px solid var(--glass-border);
    }

    .metadata-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    .metadata-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .metadata-value.success { color: var(--accent-emerald); }
    .metadata-value.failure { color: var(--accent-red); }
    .metadata-value.warning { color: var(--accent-amber); }

    .fallback-warning-item {
      grid-column: 1 / -1;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 20px;
    }

    .fallback-warning-badge { display: flex; align-items: center; gap: 10px; }
    .warning-icon { font-size: 20px; }
    .fallback-reason { color: var(--accent-amber); font-size: 14px; }

    .fallback-warning-details {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(245, 158, 11, 0.2);
      color: var(--text-secondary);
      font-size: 14px;
    }

    .similarity-chart-container {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--glass-border);
    }

    .similarity-chart-container h5 {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 16px;
    }

    .similarity-chart {
      width: 100%;
      height: 200px;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      border: 1px solid var(--glass-border);
    }

    .negotiation-rounds-section { display: none; margin-top: 24px; }
    .negotiation-rounds-section.visible { display: block; }

    .negotiation-rounds {
      background: var(--bg-secondary);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      padding: 24px;
    }

    .negotiation-rounds h4 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .negotiation-rounds h4::before { content: '🔄'; }

    .negotiation-round-collapsible {
      background: var(--bg-tertiary);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      margin-bottom: 12px;
      overflow: hidden;
      transition: all var(--transition-medium);
    }

    .negotiation-round-collapsible:hover { border-color: rgba(255, 255, 255, 0.15); }

    .round-header {
      padding: 16px 20px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }

    .round-number { font-weight: 600; color: var(--accent-cyan); }
    .round-similarity { font-size: 14px; color: var(--text-secondary); }
    .round-toggle { color: var(--text-muted); font-size: 12px; transition: transform var(--transition-fast); }
    .negotiation-round-collapsible.expanded .round-toggle { transform: rotate(180deg); }

    .round-content {
      display: none;
      padding: 0 20px 20px;
      border-top: 1px solid var(--glass-border);
    }

    .negotiation-round-collapsible.expanded .round-content { display: block; }

    .round-metrics {
      display: flex;
      gap: 20px;
      padding: 16px 0;
      font-size: 14px;
      color: var(--text-secondary);
    }

    .deadlock-risk { color: var(--accent-amber); font-weight: 600; }

    .round-responses h5 {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .response-item {
      background: var(--bg-secondary);
      border-left: 3px solid var(--accent-purple);
      padding: 16px;
      margin-bottom: 12px;
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    }

    .response-item:last-child { margin-bottom: 0; }
    .response-item strong { color: var(--accent-purple); }

    .agreement-badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent-emerald);
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 10px;
    }

    .response-content-inner {
      margin-top: 10px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .deliberation-section { display: none; margin-top: 24px; }
    .deliberation-section.visible { display: block; }

    .deliberation-container {
      background: rgba(168, 85, 247, 0.05);
      border: 1px solid rgba(168, 85, 247, 0.2);
      border-radius: var(--radius-lg);
      padding: 24px;
    }

    .deliberation-container h3 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--accent-purple);
    }

    .deliberation-container h3::before { content: '💬'; }

    .deliberation-round { margin-bottom: 28px; }
    .deliberation-round:last-child { margin-bottom: 0; }

    .deliberation-round h4 {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-cyan);
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(0, 212, 255, 0.2);
    }

    .deliberation-item {
      background: var(--bg-secondary);
      border-left: 3px solid var(--accent-purple);
      padding: 16px;
      margin-bottom: 12px;
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
    }

    .deliberation-item:last-child { margin-bottom: 0; }

    .deliberation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .council-member { font-weight: 600; color: var(--accent-purple); font-size: 14px; }
    .timestamp { font-size: 12px; color: var(--text-muted); }

    .deliberation-content {
      color: var(--text-secondary);
      line-height: 1.7;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 14px;
    }

    .no-deliberation {
      color: var(--text-muted);
      font-style: italic;
      text-align: center;
      padding: 40px;
    }

    .hidden { display: none !important; }

    @media (max-width: 768px) {
      .container { padding: 20px 16px; }
      .header { padding: 40px 24px; }
      .header h1 { font-size: 28px; }
      .content { padding: 24px; }
      .button-group { flex-direction: column; }
      .response-header { flex-direction: column; align-items: flex-start; gap: 16px; }
      .metadata-grid { grid-template-columns: 1fr; }
    }

    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg-secondary); }
    ::-webkit-scrollbar-thumb { background: var(--text-muted); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }
  </style>
</head>
<body>
  <div class="aurora-bg"></div>
  <div class="particles">
    <div class="particle" style="left: 10%; top: 20%;"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
  </div>

  <div class="container">
    <div class="glass-card">
      <div class="header">
        <div class="logo-container">
          <span class="logo-icon">🤖</span>
        </div>
        <h1>AI Council Proxy</h1>
        <p>Harness the collective intelligence of multiple AI models through consensus-driven responses</p>
      </div>

      <div class="content">
        <div class="input-section">
          <div class="input-label">
            <span class="input-label-icon">✨</span>
            Your Query
          </div>
          <div class="textarea-wrapper">
            <textarea
              id="query"
              class="query-textarea"
              placeholder="Enter your question or request here..."
              aria-label="Query input"
            ></textarea>
          </div>
        </div>

        <div class="button-group">
          <button id="submitBtn" class="btn btn-primary" onclick="submitRequest()">
            <span id="submitBtnText">Submit Request</span>
          </button>
          <button id="newRequestBtn" class="btn btn-secondary hidden" onclick="newRequest()">
            New Request
          </button>
        </div>

        <div id="statusMessage"></div>

        <div id="responseSection" class="response-section">
          <div class="response-header">
            <div class="response-title">
              <h2>Response</h2>
              <span class="response-badge">Consensus</span>
            </div>
            <button
              id="transparencyBtn"
              class="btn btn-secondary transparency-toggle"
              onclick="toggleDeliberation()"
            >
              Show Deliberation
            </button>
          </div>

          <div id="responseContent" class="response-content"></div>

          <div id="consensusMetadataSection" class="consensus-metadata-section"></div>
          <div id="negotiationRoundsSection" class="negotiation-rounds-section"></div>
          <div id="deliberationSection" class="deliberation-section">
            <div class="deliberation-container">
              <h3>Deliberation Thread</h3>
              <div id="deliberationContent"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let config = {
      transparencyEnabled: false,
      forcedTransparency: false,
      apiBaseUrl: '${this.apiBaseUrl}' || 'http://localhost:3000'
    };

    let sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = generateUUID();
      localStorage.setItem('sessionId', sessionId);
    }

    let currentRequestId = null;
    let deliberationVisible = false;

    async function loadConfig() {
      try {
        const response = await fetch('/api/ui/config');
        const data = await response.json();
        config = { ...config, ...data };
        if (!config.forcedTransparency) {
          document.getElementById('transparencyBtn').classList.add('visible');
        }
        if (config.forcedTransparency) {
          deliberationVisible = true;
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    }

    async function submitRequest() {
      const query = document.getElementById('query').value.trim();
      if (!query) {
        showStatus('Please enter a query', 'error');
        return;
      }

      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      document.getElementById('submitBtnText').innerHTML = '<span class="spinner"></span>Processing...';

      document.getElementById('responseSection').classList.remove('visible');
      document.getElementById('deliberationSection').classList.remove('visible');
      deliberationVisible = false;

      try {
        const apiKey = localStorage.getItem('apiKey') || 'demo-api-key-for-testing-purposes-only-12345678901234567890';
        const response = await fetch(\`\${config.apiBaseUrl}/api/v1/requests\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`ApiKey \${apiKey}\`
          },
          body: JSON.stringify({ query, sessionId, streaming: true })
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let error;
          if (contentType && contentType.includes('application/json')) {
            error = await response.json();
          } else {
            const text = await response.text();
            throw new Error(text || \`HTTP \${response.status}\`);
          }
          throw new Error(error.error?.message || error.message || 'Request failed');
        }

        const data = await response.json();
        currentRequestId = data.requestId;
        showStatus('Processing your request...', 'processing');
        pollForResponse(currentRequestId);
      } catch (error) {
        showStatus(\`Error: \${error.message}\`, 'error');
        submitBtn.disabled = false;
        document.getElementById('submitBtnText').textContent = 'Submit Request';
      }
    }

    async function pollForResponse(requestId) {
      const apiKey = localStorage.getItem('apiKey') || 'demo-api-key-for-testing-purposes-only-12345678901234567890';
      const maxAttempts = 120;
      let attempts = 0;

      const poll = async () => {
        try {
          const response = await fetch(\`\${config.apiBaseUrl}/api/v1/requests/\${requestId}\`, {
            headers: { 'Authorization': \`ApiKey \${apiKey}\` }
          });

          if (!response.ok) {
            if (response.status === 404 && attempts < 5) {
              attempts++;
              setTimeout(poll, 500);
              return;
            }
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || \`HTTP \${response.status}\`);
          }

          const data = await response.json();

          if (data.status === 'completed') {
            if (!currentRequestId) currentRequestId = requestId;
            displayResponse(data.consensusDecision);
            hideStatus();
            enableNewRequest();
          } else if (data.status === 'failed') {
            showStatus(\`Request failed: \${data.error || 'Unknown error'}\`, 'error');
            enableNewRequest();
          } else if (attempts < maxAttempts) {
            attempts++;
            showStatus(\`Processing... (\${attempts}/\${maxAttempts})\`, 'processing');
            setTimeout(poll, 1000);
          } else {
            showStatus('Request timeout', 'error');
            enableNewRequest();
          }
        } catch (error) {
          if (attempts < 5) {
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

    function formatResponseContent(content) {
      if (!content || typeof content !== 'string') return '';
      const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      };
      let formatted = escapeHtml(content);
      formatted = formatted.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      formatted = formatted.split('\\n').map(line => line.trim() === '---' ? '<hr>' : line).join('\\n');
      formatted = formatted.replace(/\\n\\n/g, '</p><p>');
      formatted = formatted.replace(/\\n/g, '<br>');
      return '<p>' + formatted + '</p>';
    }

    function displayResponse(decision) {
      const responseSection = document.getElementById('responseSection');
      const responseContent = document.getElementById('responseContent');

      let content;
      if (typeof decision === 'string') {
        content = decision;
      } else if (decision && typeof decision === 'object') {
        content = decision.content || decision.text || JSON.stringify(decision, null, 2);
        if (decision.confidence) content += \`\\n\\n[Confidence: \${decision.confidence}]\`;
        if (decision.agreementLevel !== undefined) content += \` [Agreement: \${(decision.agreementLevel * 100).toFixed(1)}%]\`;
      } else {
        content = String(decision || 'No response received');
      }

      responseContent.innerHTML = formatResponseContent(content);
      responseSection.classList.add('visible');

      if (decision && typeof decision === 'object' && decision.iterativeConsensusMetadata) {
        displayConsensusMetadata(decision.iterativeConsensusMetadata);
        if (currentRequestId) setTimeout(() => loadNegotiationDetails(currentRequestId), 100);
      }

      if (currentRequestId) setTimeout(() => loadDeliberationData(currentRequestId), 100);
    }

    function displayConsensusMetadata(metadata) {
      const metadataSection = document.getElementById('consensusMetadataSection');
      if (!metadataSection) return;

      const finalSim = metadata.similarityProgression?.[metadata.similarityProgression.length - 1] || 0;
      metadataSection.innerHTML = \`
        <div class="consensus-metadata">
          <h4>Consensus Details</h4>
          <div class="metadata-grid">
            <div class="metadata-item">
              <span class="metadata-label">Total Rounds</span>
              <span class="metadata-value">\${metadata.totalRounds || 0}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Consensus Achieved</span>
              <span class="metadata-value \${metadata.consensusAchieved ? 'success' : 'failure'}">
                \${metadata.consensusAchieved ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Final Similarity</span>
              <span class="metadata-value">\${(finalSim * 100).toFixed(1)}%</span>
            </div>
            \${metadata.fallbackUsed ? \`
            <div class="metadata-item fallback-warning-item">
              <span class="metadata-label">Fallback Used</span>
              <div class="fallback-warning-badge">
                <span class="warning-icon">⚠️</span>
                <span class="metadata-value warning">Yes</span>
                <span class="fallback-reason">(\${metadata.fallbackReason || 'Unknown'})</span>
              </div>
            </div>\` : ''}
          </div>
        </div>
      \`;
      metadataSection.classList.add('visible');
    }

    async function loadNegotiationDetails(requestId) {
      try {
        const apiKey = localStorage.getItem('apiKey') || 'demo-api-key-for-testing-purposes-only-12345678901234567890';
        const response = await fetch(\`\${config.apiBaseUrl}/api/v1/requests/\${requestId}/negotiation\`, {
          headers: { 'Authorization': \`ApiKey \${apiKey}\` }
        });
        if (!response.ok) return;
        const data = await response.json();
        displayNegotiationRounds(data);
      } catch (error) {
        console.log('Could not load negotiation details');
      }
    }

    function displayNegotiationRounds(data) {
      const negotiationSection = document.getElementById('negotiationRoundsSection');
      if (!negotiationSection || !data.rounds || data.rounds.length === 0) return;

      negotiationSection.innerHTML = \`
        <div class="negotiation-rounds">
          <h4>Negotiation Rounds</h4>
          \${data.rounds.map(round => \`
            <div class="negotiation-round-collapsible">
              <div class="round-header" onclick="this.parentElement.classList.toggle('expanded')">
                <span class="round-number">Round \${round.roundNumber}</span>
                <span class="round-similarity">Avg Similarity: \${(round.averageSimilarity * 100).toFixed(1)}%</span>
                <span class="round-toggle">▼</span>
              </div>
              <div class="round-content">
                <div class="round-metrics">
                  <span>Min: \${(round.minSimilarity * 100).toFixed(1)}%</span>
                  <span>Max: \${(round.maxSimilarity * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          \`).join('')}
        </div>
      \`;
      negotiationSection.classList.add('visible');
    }

    async function loadDeliberationData(requestId) {
      try {
        const apiKey = localStorage.getItem('apiKey') || 'demo-api-key-for-testing-purposes-only-12345678901234567890';
        const response = await fetch(\`\${config.apiBaseUrl}/api/v1/requests/\${requestId}/deliberation\`, {
          headers: { 'Authorization': \`ApiKey \${apiKey}\` }
        });
        if (!response.ok) {
          displayDeliberation([]);
          return;
        }
        const deliberationThread = await response.json();
        const items = [];
        if (deliberationThread?.rounds) {
          for (const round of deliberationThread.rounds) {
            if (round.exchanges) {
              for (const exchange of round.exchanges) {
                items.push({
                  councilMember: exchange.councilMemberId || 'Unknown',
                  timestamp: new Date().toISOString(),
                  content: exchange.content || '',
                  roundNumber: round.roundNumber || 0
                });
              }
            }
          }
        }
        displayDeliberation(items);
      } catch (error) {
        displayDeliberation([]);
      }
    }

    function displayDeliberation(deliberation) {
      const deliberationContent = document.getElementById('deliberationContent');
      if (!deliberation || deliberation.length === 0) {
        deliberationContent.innerHTML = '<p class="no-deliberation">No deliberation data available.</p>';
        return;
      }

      const rounds = {};
      deliberation.forEach(item => {
        const roundNum = item.roundNumber || 0;
        if (!rounds[roundNum]) rounds[roundNum] = [];
        rounds[roundNum].push(item);
      });

      const roundKeys = Object.keys(rounds).sort((a, b) => parseInt(a) - parseInt(b));
      deliberationContent.innerHTML = roundKeys.map(roundNum => \`
        <div class="deliberation-round">
          <h4>Round \${roundNum}</h4>
          \${rounds[roundNum].map(item => \`
            <div class="deliberation-item">
              <div class="deliberation-header">
                <span class="council-member">\${escapeHtml(item.councilMember)}</span>
                <span class="timestamp">\${new Date(item.timestamp).toLocaleString()}</span>
              </div>
              <div class="deliberation-content">\${escapeHtml(item.content)}</div>
            </div>
          \`).join('')}
        </div>
      \`).join('');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function toggleDeliberation() {
      if (config.forcedTransparency) return;
      const deliberationSection = document.getElementById('deliberationSection');
      const transparencyBtn = document.getElementById('transparencyBtn');
      deliberationVisible = !deliberationVisible;
      if (deliberationVisible) {
        deliberationSection.classList.add('visible');
        transparencyBtn.textContent = 'Hide Deliberation';
        if (currentRequestId) loadDeliberationData(currentRequestId);
      } else {
        deliberationSection.classList.remove('visible');
        transparencyBtn.textContent = 'Show Deliberation';
      }
    }

    function showStatus(message, type) {
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.className = \`status-message status-\${type}\`;
      if (type === 'processing') {
        statusMessage.innerHTML = \`<span class="spinner"></span>\${message}\`;
      } else {
        statusMessage.textContent = message;
      }
    }

    function hideStatus() {
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.className = '';
      statusMessage.textContent = '';
    }

    function enableNewRequest() {
      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = false;
      document.getElementById('submitBtnText').textContent = 'Submit Request';
      document.getElementById('newRequestBtn').classList.remove('hidden');
    }

    function newRequest() {
      document.getElementById('query').value = '';
      document.getElementById('responseSection').classList.remove('visible');
      document.getElementById('deliberationSection').classList.remove('visible');
      document.getElementById('newRequestBtn').classList.add('hidden');
      hideStatus();
      currentRequestId = null;
      deliberationVisible = false;
    }

    function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    loadConfig();
  </script>
</body>
</html>
    `;
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`User Interface listening on port ${port}`);
        resolve();
      });
    });
  }

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
