/**
 * Admin Dashboard Server
 * Provides web interface for monitoring and managing the AI Council Proxy
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { Server } from 'http';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import http from 'http';

import { IDashboard } from '../interfaces/IDashboard';
import { IConfigurationManager } from '../interfaces/IConfigurationManager';
import { IModelRegistry } from '../interfaces/IModelRegistry';
import { ISyncScheduler } from '../interfaces/ISyncScheduler';
import { TimeRange, CouncilConfig } from '../types/core';

/**
 * Admin Server implementation
 * Serves static files and provides admin API endpoints
 */
export class AdminServer {
  private app: Express;
  private server?: Server;
  private dashboard: IDashboard;
  private configManager: IConfigurationManager;
  private modelRegistry?: IModelRegistry;
  private syncScheduler?: ISyncScheduler;
  private db: Pool;
  private redis: RedisClientType;

  constructor(
    dashboard: IDashboard,
    configManager: IConfigurationManager,
    db: Pool,
    redis: RedisClientType,
    modelRegistry?: IModelRegistry,
    syncScheduler?: ISyncScheduler
  ) {
    this.app = express();
    this.dashboard = dashboard;
    this.configManager = configManager;
    this.modelRegistry = modelRegistry;
    this.syncScheduler = syncScheduler;
    this.db = db;
    this.redis = redis;

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Serve static files from public directory
    const publicPath = path.join(__dirname, '../../src/dashboard/public');
    this.app.use(express.static(publicPath));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(
        `${new Date().toISOString()} - Admin: ${req.method} ${req.path}`
      );
      next();
    });
  }

  /**
   * Set up admin API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Proxy /api/v1/* requests to the API gateway
    this.app.use('/api/v1', this.proxyToApiGateway.bind(this));

    // Overview metrics
    this.app.get('/api/admin/overview', this.getOverview.bind(this));

    // Provider health
    this.app.get('/api/admin/providers', this.getProviders.bind(this));

    // Recent activity
    this.app.get('/api/admin/activity', this.getActivity.bind(this));

    // Configuration
    this.app.get('/api/admin/config', this.getConfig.bind(this));
    this.app.post('/api/admin/config', this.updateConfig.bind(this));

    // Analytics
    this.app.get(
      '/api/admin/analytics/performance',
      this.getPerformanceAnalytics.bind(this)
    );
    this.app.get('/api/admin/analytics/cost', this.getCostAnalytics.bind(this));

    // Logs
    this.app.get('/api/admin/logs', this.getLogs.bind(this));

    // Model Management
    this.app.get('/api/admin/models', this.getModels.bind(this));
    this.app.get('/api/admin/models/:id', this.getModelDetails.bind(this));
    this.app.get(
      '/api/admin/models/:id/pricing-history',
      this.getModelPricingHistory.bind(this)
    );
    this.app.get('/api/admin/sync/status', this.getSyncStatus.bind(this));
    this.app.get('/api/admin/sync/history', this.getSyncHistory.bind(this));
    this.app.post('/api/admin/sync/trigger', this.triggerSync.bind(this));

    // Preset Management
    this.app.get('/api/admin/presets', this.getPresets.bind(this));
    this.app.get('/api/admin/presets/:name', this.getPreset.bind(this));
    this.app.put('/api/admin/presets/:name', this.updatePreset.bind(this));
    this.app.get(
      '/api/admin/available-models',
      this.getAvailableModelsForConfig.bind(this)
    );

    // Root route - serve admin.html
    this.app.get('/', (req: Request, res: Response) => {
      const htmlPath = path.join(
        __dirname,
        '../../src/dashboard/public/admin.html'
      );
      res.sendFile(htmlPath);
    });

    // Error handling
    this.app.use(this.errorHandler.bind(this));
  }

  /**
   * Proxy requests to the API Gateway for /api/v1/* endpoints
   * This allows the Test Query feature to work from the admin dashboard
   */
  private proxyToApiGateway(
    req: Request,
    res: Response,
    _next: NextFunction
  ): void {
    const apiHost = process.env.API_HOST || 'localhost';
    const apiPort = process.env.API_PORT || '3000';

    // For Docker internal networking, use service name
    const targetHost = process.env.API_INTERNAL_HOST || apiHost;

    const options: http.RequestOptions = {
      hostname: targetHost,
      port: parseInt(apiPort),
      path: `/api/v1${req.url}`,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${targetHost}:${apiPort}`
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      console.error('[Admin] API Gateway proxy error:', error.message);
      res.status(502).json({
        error: {
          code: 'API_GATEWAY_UNAVAILABLE',
          message:
            'Unable to connect to API Gateway. Please ensure the API service is running.',
          details: { host: targetHost, port: apiPort }
        }
      });
    });

    // Forward request body for POST/PUT requests
    if (
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) {
      proxyReq.write(JSON.stringify(req.body));
    }

    proxyReq.end();
  }

  /**
   * Get overview metrics
   */
  private async getOverview(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const timeRange: TimeRange = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date()
      };

      const statsQuery = `
        SELECT
          COUNT(*) as total_requests,
          AVG(total_latency_ms) as avg_latency,
          SUM(total_cost) as total_cost,
          AVG(total_cost) as avg_cost,
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::float / NULLIF(COUNT(*), 0) as success_rate,
          COUNT(CASE WHEN consensus_decision IS NOT NULL THEN 1 END)::float / NULLIF(COUNT(*), 0) as consensus_rate
        FROM requests
        WHERE created_at >= $1 AND created_at <= $2
      `;

      const statsResult = await this.db.query(statsQuery, [
        timeRange.start,
        timeRange.end
      ]);
      const stats = statsResult.rows[0];

      // Calculate average deliberation rounds from deliberation_exchanges table
      const deliberationQuery = `
        SELECT AVG(rounds_per_request) as avg_deliberations
        FROM (
          SELECT request_id, COUNT(DISTINCT round_number) as rounds_per_request
          FROM deliberation_exchanges
          WHERE created_at >= $1 AND created_at <= $2
          GROUP BY request_id
        ) as deliberation_rounds
      `;

      const deliberationResult = await this.db.query(deliberationQuery, [
        timeRange.start,
        timeRange.end
      ]);
      const avgDeliberations =
        deliberationResult.rows[0]?.avg_deliberations || '0';

      const sessionKeys = await this.redis.keys('session:*');
      const activeSessions = sessionKeys.length;

      res.json({
        totalRequests: parseInt(stats.total_requests) || 0,
        activeSessions,
        avgResponseTime: `${Math.round(parseFloat(stats.avg_latency) || 0)}ms`,
        totalCost: `$${parseFloat(stats.total_cost || '0').toFixed(4)}`,
        todayCost: `$${parseFloat(stats.total_cost || '0').toFixed(4)}`,
        avgCost: `$${parseFloat(stats.avg_cost || '0').toFixed(4)}`,
        successRate: `${((parseFloat(stats.success_rate) || 0) * 100).toFixed(1)}%`,
        consensusRate: `${((parseFloat(stats.consensus_rate) || 0) * 100).toFixed(1)}%`,
        avgDeliberations: `${parseFloat(avgDeliberations.toString()).toFixed(1)}`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get provider health status
   */
  private async getProviders(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Get basic provider health data - start with empty array fallback
      let providerList: any[] = [];

      try {
        const providerHealthResult = await this.db.query(`
          SELECT
            provider_id,
            status,
            success_rate,
            avg_latency_ms,
            updated_at
          FROM provider_health
          ORDER BY provider_id
        `);

        if (providerHealthResult.rows && providerHealthResult.rows.length > 0) {
          providerList = providerHealthResult.rows;
        } else {
          // If provider_health table is empty, create default providers from common ones
          providerList = [
            {
              provider_id: 'openai',
              status: 'unknown',
              success_rate: null,
              avg_latency_ms: null
            },
            {
              provider_id: 'anthropic',
              status: 'unknown',
              success_rate: null,
              avg_latency_ms: null
            },
            {
              provider_id: 'google',
              status: 'unknown',
              success_rate: null,
              avg_latency_ms: null
            },
            {
              provider_id: 'xai',
              status: 'unknown',
              success_rate: null,
              avg_latency_ms: null
            }
          ];
        }
      } catch (healthError) {
        console.error('Error querying provider_health table:', healthError);
        // Use default providers if table doesn't exist or has issues
        providerList = [
          {
            provider_id: 'openai',
            status: 'unknown',
            success_rate: null,
            avg_latency_ms: null
          },
          {
            provider_id: 'anthropic',
            status: 'unknown',
            success_rate: null,
            avg_latency_ms: null
          },
          {
            provider_id: 'google',
            status: 'unknown',
            success_rate: null,
            avg_latency_ms: null
          },
          {
            provider_id: 'xai',
            status: 'unknown',
            success_rate: null,
            avg_latency_ms: null
          }
        ];
      }

      // Get request counts - simplified and more robust approach
      const providerStatsMap = new Map();
      try {
        const providerStatsResult = await this.db.query(`
          SELECT
            council_member_id,
            COUNT(*) as request_count
          FROM council_responses
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY council_member_id
        `);

        for (const stat of providerStatsResult.rows) {
          providerStatsMap.set(stat.council_member_id, {
            requestCount: parseInt(stat.request_count) || 0,
            consecutiveFailures: 0
          });
        }
      } catch (statsError) {
        console.error('Error getting provider stats:', statsError);
        // Continue with empty stats map
      }

      // Build the final provider list
      const result = providerList.map((p) => {
        const stats = providerStatsMap.get(p.provider_id) ||
          providerStatsMap.get(`member-${p.provider_id}`) || {
          requestCount: 0,
          consecutiveFailures: 0
        };

        return {
          id: p.provider_id,
          name: p.provider_id,
          status: p.status || 'unknown',
          successRate: `${(parseFloat(p.success_rate || 0) * 100).toFixed(1)}%`,
          avgLatency: `${Math.round(p.avg_latency_ms || 0)}ms`,
          requestCount: stats.requestCount,
          consecutiveFailures: stats.consecutiveFailures
        };
      });

      res.json(result);
    } catch (error) {
      console.error('Error in getProviders:', error);
      // Return safe fallback data
      res.json([
        {
          id: 'openai',
          name: 'openai',
          status: 'unknown',
          successRate: '0.0%',
          avgLatency: '0ms',
          requestCount: 0,
          consecutiveFailures: 0
        },
        {
          id: 'anthropic',
          name: 'anthropic',
          status: 'unknown',
          successRate: '0.0%',
          avgLatency: '0ms',
          requestCount: 0,
          consecutiveFailures: 0
        },
        {
          id: 'google',
          name: 'google',
          status: 'unknown',
          successRate: '0.0%',
          avgLatency: '0ms',
          requestCount: 0,
          consecutiveFailures: 0
        },
        {
          id: 'xai',
          name: 'xai',
          status: 'unknown',
          successRate: '0.0%',
          avgLatency: '0ms',
          requestCount: 0,
          consecutiveFailures: 0
        }
      ]);
    }
  }

  /**
   * Get recent activity - query directly to handle NULL values
   */
  private async getActivity(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await this.db.query(
        `
                SELECT
                    id,
                    query,
                    status,
                    total_cost,
                    total_latency_ms,
                    agreement_level,
                    created_at
                FROM requests
                ORDER BY created_at DESC
                LIMIT $1
            `,
        [limit]
      );

      const activity = result.rows.map((r) => ({
        requestId: r.id,
        query: r.query
          ? r.query.substring(0, 100) + (r.query.length > 100 ? '...' : '')
          : 'N/A',
        status: r.status || 'unknown',
        cost: r.total_cost ? `$${parseFloat(r.total_cost).toFixed(4)}` : 'N/A',
        latency: r.total_latency_ms ? `${r.total_latency_ms}ms` : 'N/A',
        agreement: r.agreement_level
          ? `${(parseFloat(r.agreement_level) * 100).toFixed(0)}%`
          : 'N/A',
        timestamp: r.created_at
          ? new Date(r.created_at).toISOString()
          : new Date().toISOString()
      }));

      res.json(activity);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current configuration
   */
  private async getConfig(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const councilConfig: CouncilConfig =
        await this.configManager.getCouncilConfig();
      const deliberationConfig =
        await this.configManager.getDeliberationConfig();
      const synthesisConfig = await this.configManager.getSynthesisConfig();
      const performanceConfig = await this.configManager.getPerformanceConfig();

      res.json({
        maxRounds: deliberationConfig.rounds,
        consensusThreshold: 0.7, // This would come from a consensus config if we had one
        synthesisStrategy: synthesisConfig.strategy.type,
        members: councilConfig.members.map((m) => ({
          id: m.id,
          provider: m.provider,
          model: m.model,
          enabled: true,
          timeout: m.timeout,
          retryPolicy: m.retryPolicy
        })),
        councilMinimumSize: councilConfig.minimumSize,
        councilRequireMinimum: councilConfig.requireMinimumForConsensus,
        globalTimeout: performanceConfig.globalTimeout,
        enableFastFallback: performanceConfig.enableFastFallback,
        streamingEnabled: performanceConfig.streamingEnabled
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get available models for configuration (grouped by provider)
   */
  private async getAvailableModelsForConfig(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT id, provider, display_name, classification, context_window, usability
        FROM models
        WHERE usability = 'available'
        ORDER BY provider, display_name
      `);

      // Group models by provider
      const modelsByProvider: Record<
        string,
        Array<{
          id: string;
          displayName: string;
          classification: string[];
          contextWindow: number;
        }>
      > = {};

      for (const row of result.rows) {
        if (!modelsByProvider[row.provider]) {
          modelsByProvider[row.provider] = [];
        }
        modelsByProvider[row.provider].push({
          id: row.id,
          displayName: row.display_name || row.id,
          classification: row.classification || [],
          contextWindow: row.context_window || 0
        });
      }

      res.json(modelsByProvider);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all presets with their configurations
   */
  private async getPresets(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Get custom presets from database
      const result = await this.db.query(`
        SELECT preset_name, config_data, created_at, updated_at
        FROM council_presets
        ORDER BY preset_name
      `);

      const customPresets: Record<string, any> = {};
      for (const row of result.rows) {
        customPresets[row.preset_name] = {
          ...row.config_data,
          isCustom: true,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }

      // Built-in presets
      const builtInPresets = {
        'fast-council': {
          name: 'Fast Council',
          description: 'Quick responses with minimal deliberation',
          memberCount: 2,
          deliberationRounds: 0,
          isCustom: false
        },
        'balanced-council': {
          name: 'Balanced Council',
          description: 'Good balance of speed and quality',
          memberCount: 3,
          deliberationRounds: 1,
          isCustom: false
        },
        'research-council': {
          name: 'Research Council',
          description: 'Thorough analysis with multiple deliberation rounds',
          memberCount: 4,
          deliberationRounds: 4,
          isCustom: false
        },
        'coding-council': {
          name: 'Coding Council',
          description: 'Optimized for code generation and review',
          memberCount: 3,
          deliberationRounds: 3,
          isCustom: false
        },
        'cost-effective-council': {
          name: 'Cost-Effective Council',
          description: 'Budget-friendly models for high-volume tasks',
          memberCount: 4,
          deliberationRounds: 1,
          isCustom: false
        }
      };

      res.json({
        builtIn: builtInPresets,
        custom: customPresets
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a specific preset configuration
   */
  private async getPreset(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { name } = req.params;

      // Check for custom preset first
      const result = await this.db.query(
        `
        SELECT preset_name, config_data, created_at, updated_at
        FROM council_presets
        WHERE preset_name = $1
      `,
        [name]
      );

      if (result.rows.length > 0) {
        res.json({
          name: result.rows[0].preset_name,
          ...result.rows[0].config_data,
          isCustom: true,
          createdAt: result.rows[0].created_at,
          updatedAt: result.rows[0].updated_at
        });
        return;
      }

      // Return built-in preset info
      const builtInPresets: Record<string, any> = {
        'fast-council': {
          name: 'fast-council',
          displayName: 'Fast Council',
          description: 'Quick responses with minimal deliberation',
          members: [
            { provider: 'openai', model: 'gpt-3.5-turbo', timeout: 15 },
            { provider: 'anthropic', model: 'claude-instant-1.2', timeout: 15 }
          ],
          deliberationRounds: 0,
          synthesisStrategy: 'consensus-extraction',
          globalTimeout: 30
        },
        'balanced-council': {
          name: 'balanced-council',
          displayName: 'Balanced Council',
          description: 'Good balance of speed and quality',
          members: [
            { provider: 'openai', model: 'gpt-4', timeout: 30 },
            {
              provider: 'anthropic',
              model: 'claude-3-opus-20240229',
              timeout: 30
            },
            { provider: 'google', model: 'gemini-pro', timeout: 30 }
          ],
          deliberationRounds: 1,
          synthesisStrategy: 'consensus-extraction',
          globalTimeout: 60
        },
        'research-council': {
          name: 'research-council',
          displayName: 'Research Council',
          description: 'Thorough analysis with multiple deliberation rounds',
          members: [
            { provider: 'openai', model: 'gpt-4', timeout: 60 },
            {
              provider: 'anthropic',
              model: 'claude-3-opus-20240229',
              timeout: 60
            },
            { provider: 'google', model: 'gemini-pro', timeout: 60 },
            { provider: 'xai', model: 'grok-2', timeout: 60 }
          ],
          deliberationRounds: 4,
          synthesisStrategy: 'meta-synthesis',
          globalTimeout: 180
        },
        'coding-council': {
          name: 'coding-council',
          displayName: 'Coding Council',
          description: 'Optimized for code generation and review',
          members: [
            { provider: 'openai', model: 'gpt-4', timeout: 45 },
            {
              provider: 'anthropic',
              model: 'claude-3-opus-20240229',
              timeout: 45
            },
            { provider: 'google', model: 'gemini-pro', timeout: 45 }
          ],
          deliberationRounds: 3,
          synthesisStrategy: 'weighted-fusion',
          globalTimeout: 120
        },
        'cost-effective-council': {
          name: 'cost-effective-council',
          displayName: 'Cost-Effective Council',
          description:
            'Budget-friendly models: GPT-4o-mini, Claude 3.5 Haiku, Gemini 2.5 Flash-Lite, Grok 3 Mini',
          members: [
            { provider: 'openai', model: 'gpt-4o-mini', timeout: 20 },
            {
              provider: 'anthropic',
              model: 'claude-3.5-haiku-latest',
              timeout: 20
            },
            { provider: 'google', model: 'gemini-2.5-flash-lite', timeout: 20 },
            { provider: 'xai', model: 'grok-3-mini', timeout: 20 }
          ],
          deliberationRounds: 1,
          synthesisStrategy: 'consensus-extraction',
          globalTimeout: 45
        }
      };

      if (builtInPresets[name]) {
        res.json({ ...builtInPresets[name], isCustom: false });
      } else {
        res.status(404).json({ error: `Preset '${name}' not found` });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update or create a preset configuration
   */
  private async updatePreset(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { name } = req.params;
      const {
        members,
        deliberationRounds,
        synthesisStrategy,
        globalTimeout,
        displayName,
        description
      } = req.body;

      // Validate members
      if (!members || !Array.isArray(members) || members.length === 0) {
        res
          .status(400)
          .json({ error: 'At least one council member is required' });
        return;
      }

      // Validate each member has required fields
      for (const member of members) {
        if (!member.provider || !member.model) {
          res
            .status(400)
            .json({ error: 'Each member must have provider and model' });
          return;
        }
      }

      const configData = {
        displayName: displayName || name,
        description: description || '',
        members: members.map((m: any, idx: number) => ({
          id: `${m.provider}-${m.model}-${idx}`,
          provider: m.provider,
          model: m.model,
          timeout: m.timeout || 30
        })),
        deliberationRounds: deliberationRounds || 1,
        synthesisStrategy: synthesisStrategy || 'consensus-extraction',
        globalTimeout: globalTimeout || 60
      };

      // Upsert the preset
      await this.db.query(
        `
        INSERT INTO council_presets (preset_name, config_data, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (preset_name) DO UPDATE SET
          config_data = EXCLUDED.config_data,
          updated_at = NOW()
      `,
        [name, JSON.stringify(configData)]
      );

      res.json({
        success: true,
        message: `Preset '${name}' saved successfully`,
        preset: configData
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update configuration
   */
  private async updateConfig(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        preset,
        maxRounds,
        consensusThreshold,
        synthesisStrategy,
        members
      } = req.body;

      if (preset) {
        // Check if it's a custom preset
        const customPreset = await this.db.query(
          'SELECT config_data FROM council_presets WHERE preset_name = $1',
          [preset]
        );

        if (customPreset.rows.length > 0) {
          // Apply custom preset
          const config = customPreset.rows[0].config_data;
          await this.applyCustomPreset(config);
          res.json({
            success: true,
            message: `Custom preset ${preset} applied successfully`
          });
        } else {
          // Apply built-in preset
          await this.configManager.applyPreset(preset);
          res.json({
            success: true,
            message: `Preset ${preset} applied successfully`
          });
        }
      } else if (members && Array.isArray(members)) {
        // Update council members directly
        const councilConfig = await this.configManager.getCouncilConfig();
        councilConfig.members = members.map((m: any, idx: number) => ({
          id: m.id || `${m.provider}-${m.model}-${idx}`,
          provider: m.provider,
          model: m.model,
          timeout: m.timeout || 30,
          retryPolicy: m.retryPolicy || {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
          }
        }));
        councilConfig.minimumSize = Math.min(2, members.length);
        await this.updateCouncilConfig(councilConfig);
        res.json({
          success: true,
          message: 'Council members updated successfully'
        });
      } else {
        // Update individual configurations
        const updates: Promise<any>[] = [];

        // Update deliberation config if maxRounds provided
        if (maxRounds !== undefined) {
          const deliberationConfig =
            await this.configManager.getDeliberationConfig();
          deliberationConfig.rounds = maxRounds;
          updates.push(this.updateDeliberationConfig(deliberationConfig));
        }

        // Update synthesis config if synthesisStrategy provided
        if (synthesisStrategy) {
          const synthesisConfig = await this.configManager.getSynthesisConfig();
          synthesisConfig.strategy = { type: synthesisStrategy };
          updates.push(this.updateSynthesisConfig(synthesisConfig));
        }

        // Note: consensusThreshold would need a consensus config table/model to update
        // For now, we'll just acknowledge it in the response

        await Promise.all(updates);
        res.json({
          success: true,
          message: 'Configuration updated successfully'
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apply a custom preset configuration
   */
  private async applyCustomPreset(config: any): Promise<void> {
    // Update council config with custom members
    const councilConfig = await this.configManager.getCouncilConfig();
    councilConfig.members = config.members.map((m: any) => ({
      id: m.id,
      provider: m.provider,
      model: m.model,
      timeout: m.timeout || 30,
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
      }
    }));
    councilConfig.minimumSize = Math.min(2, config.members.length);
    await this.updateCouncilConfig(councilConfig);

    // Update deliberation config
    const deliberationConfig = await this.configManager.getDeliberationConfig();
    deliberationConfig.rounds = config.deliberationRounds || 1;
    await this.updateDeliberationConfig(deliberationConfig);

    // Update synthesis config
    const synthesisConfig = await this.configManager.getSynthesisConfig();
    synthesisConfig.strategy = {
      type: config.synthesisStrategy || 'consensus-extraction'
    };
    await this.updateSynthesisConfig(synthesisConfig);

    // Update performance config
    const performanceConfig = await this.configManager.getPerformanceConfig();
    performanceConfig.globalTimeout = config.globalTimeout || 60;
    await this.updatePerformanceConfig(performanceConfig);
  }

  /**
   * Update council configuration in database
   */
  private async updateCouncilConfig(config: any): Promise<void> {
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'council'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'council' AND active = true`
    );

    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'council', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );

    // Invalidate cache
    await this.redis.del('config:council');
  }

  /**
   * Update performance configuration in database
   */
  private async updatePerformanceConfig(config: any): Promise<void> {
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'performance'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'performance' AND active = true`
    );

    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'performance', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );

    // Invalidate cache
    await this.redis.del('config:performance');
  }

  /**
   * Update deliberation configuration
   */
  private async updateDeliberationConfig(config: any): Promise<void> {
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'deliberation'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'deliberation' AND active = true`
    );

    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'deliberation', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );
  }

  /**
   * Update synthesis configuration
   */
  private async updateSynthesisConfig(config: any): Promise<void> {
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) as max_version
       FROM configurations WHERE config_type = 'synthesis'`
    );
    const newVersion = versionResult.rows[0].max_version + 1;

    await this.db.query(
      `UPDATE configurations SET active = false
       WHERE config_type = 'synthesis' AND active = true`
    );

    await this.db.query(
      `INSERT INTO configurations (id, config_type, config_data, version, created_at, active)
       VALUES (gen_random_uuid(), 'synthesis', $1, $2, NOW(), true)`,
      [JSON.stringify(config), newVersion]
    );
  }

  /**
   * Get performance analytics
   */
  private async getPerformanceAnalytics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const timeRange: TimeRange = {
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      // Calculate real performance metrics from requests table
      const analyticsQuery = `
        SELECT
          COUNT(*) as total_requests,
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::float / NULLIF(COUNT(*), 0) as success_rate,
          COUNT(CASE WHEN consensus_decision IS NOT NULL THEN 1 END)::float / NULLIF(COUNT(*), 0) as consensus_rate,
          AVG(total_latency_ms) as average_latency
        FROM requests
        WHERE created_at >= $1 AND created_at <= $2
      `;

      const analyticsResult = await this.db.query(analyticsQuery, [
        timeRange.start,
        timeRange.end
      ]);
      const analytics = analyticsResult.rows[0];

      // Calculate average deliberation rounds
      const deliberationQuery = `
        SELECT AVG(rounds_per_request) as avg_deliberation_rounds
        FROM (
          SELECT request_id, COUNT(DISTINCT round_number) as rounds_per_request
          FROM deliberation_exchanges
          WHERE created_at >= $1 AND created_at <= $2
          GROUP BY request_id
        ) as deliberation_rounds
      `;

      const deliberationResult = await this.db.query(deliberationQuery, [
        timeRange.start,
        timeRange.end
      ]);
      const avgDeliberationRounds =
        deliberationResult.rows[0]?.avg_deliberation_rounds || 0;

      res.json({
        totalRequests: parseInt(analytics.total_requests) || 0,
        successRate: parseFloat(analytics.success_rate) || 0,
        consensusRate: parseFloat(analytics.consensus_rate) || 0,
        averageLatency: Math.round(parseFloat(analytics.average_latency) || 0),
        averageDeliberationRounds:
          parseFloat(avgDeliberationRounds.toString()) || 0
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get cost analytics
   */
  private async getCostAnalytics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const timeRange: TimeRange = {
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      // Calculate real cost analytics from cost_records table
      const costQuery = `
        SELECT
          SUM(cost) as total_cost,
          AVG(cost) as average_cost_per_request,
          COUNT(*) as total_requests
        FROM cost_records
        WHERE created_at >= $1 AND created_at <= $2
      `;

      const costResult = await this.db.query(costQuery, [
        timeRange.start,
        timeRange.end
      ]);
      const costData = costResult.rows[0];

      // Get cost breakdown by provider
      const costByProviderQuery = `
        SELECT
          provider,
          SUM(cost) as total_cost,
          COUNT(*) as request_count
        FROM cost_records
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY provider
      `;

      const providerResult = await this.db.query(costByProviderQuery, [
        timeRange.start,
        timeRange.end
      ]);
      const costByProvider: Record<string, number> = {};

      for (const row of providerResult.rows) {
        costByProvider[row.provider] = parseFloat(row.total_cost);
      }

      // Get cost breakdown by model
      const costByModelQuery = `
        SELECT
          model,
          SUM(cost) as total_cost,
          COUNT(*) as request_count
        FROM cost_records
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY model
      `;

      const modelResult = await this.db.query(costByModelQuery, [
        timeRange.start,
        timeRange.end
      ]);
      const costByModel: Record<string, number> = {};

      for (const row of modelResult.rows) {
        costByModel[row.model] = parseFloat(row.total_cost);
      }

      res.json({
        totalCost: parseFloat(costData.total_cost) || 0,
        averageCostPerRequest:
          parseFloat(costData.average_cost_per_request) || 0,
        costByProvider,
        costByModel
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get system logs
   */
  private async getLogs(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;

      const result = await this.db.query(
        `
                SELECT
                    id,
                    status,
                    query,
                    total_cost,
                    total_latency_ms,
                    created_at
                FROM requests
                ORDER BY created_at DESC
                LIMIT $1
            `,
        [limit]
      );

      const logs = result.rows.map((row) => ({
        type: `request_${row.status}`,
        data: {
          requestId: row.id,
          query: row.query ? row.query.substring(0, 100) : 'N/A',
          cost: row.total_cost || 'N/A',
          latency: row.total_latency_ms || 'N/A'
        },
        timestamp: row.created_at
          ? new Date(row.created_at).toISOString()
          : new Date().toISOString()
      }));

      res.json(logs);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get discovered models
   */
  private async getModels(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!this.modelRegistry) {
        res.status(503).json({ error: 'Model Registry not configured' });
        return;
      }

      const provider = req.query.provider as string | undefined;
      const classification = req.query.classification as string | undefined;
      const usability = req.query.usability as
        | 'available'
        | 'preview'
        | 'deprecated'
        | undefined;

      const filter: any = {};
      if (provider) {filter.provider = provider;}
      if (classification) {filter.classification = classification;}
      if (usability) {filter.usability = usability;}

      const models = await this.modelRegistry.getModels(filter);

      res.json({
        models: models.map((m) => ({
          id: m.id,
          provider: m.provider,
          displayName: m.displayName,
          classification: m.classification,
          contextWindow: m.contextWindow,
          usability: m.usability,
          pricing: m.pricing,
          capabilities: m.capabilities,
          discoveredAt: m.discoveredAt
        })),
        count: models.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get model details
   */
  private async getModelDetails(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!this.modelRegistry) {
        res.status(503).json({ error: 'Model Registry not configured' });
        return;
      }

      const modelId = req.params.id;
      const model = await this.modelRegistry.getModel(modelId);

      if (!model) {
        res.status(404).json({ error: 'Model not found' });
        return;
      }

      res.json(model);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get model pricing history
   */
  private async getModelPricingHistory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!this.modelRegistry) {
        res.status(503).json({ error: 'Model Registry not configured' });
        return;
      }

      const modelId = req.params.id;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Default: 90 days ago
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      const history = await this.modelRegistry.getPricingHistory(
        modelId,
        startDate,
        endDate
      );

      res.json({
        modelId,
        history,
        count: history.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sync status
   */
  private async getSyncStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!this.syncScheduler) {
        res.status(503).json({ error: 'Sync Scheduler not configured' });
        return;
      }

      const status = await this.syncScheduler.getLastSyncStatus();

      res.json({
        lastSync: status.lastSync,
        nextSync: status.nextSync,
        status: status.status,
        lastResult: status.lastResult
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sync job history
   */
  private async getSyncHistory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      // Query sync_status table for historical sync data
      const result = await this.db.query(
        `SELECT
          provider,
          last_sync,
          status,
          models_discovered,
          models_updated,
          models_deprecated,
          pricing_updated,
          errors,
          updated_at
        FROM sync_status
        ORDER BY updated_at DESC
        LIMIT $1`,
        [limit]
      );

      const history = result.rows.map((row) => ({
        provider: row.provider,
        lastSync: row.last_sync,
        status: row.status,
        modelsDiscovered: row.models_discovered || 0,
        modelsUpdated: row.models_updated || 0,
        modelsDeprecated: row.models_deprecated || 0,
        pricingUpdated: row.pricing_updated || 0,
        errors: row.errors || [],
        timestamp: row.updated_at
      }));

      // Calculate success/failure rates per provider
      const statsQuery = `
        SELECT
          provider,
          COUNT(*) as total_syncs,
          COUNT(CASE WHEN status = 'idle' THEN 1 END) as successful_syncs,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_syncs
        FROM sync_status
        WHERE updated_at >= NOW() - INTERVAL '30 days'
        GROUP BY provider
      `;

      const statsResult = await this.db.query(statsQuery);
      const providerStats = statsResult.rows.map((row) => ({
        provider: row.provider,
        totalSyncs: parseInt(row.total_syncs),
        successfulSyncs: parseInt(row.successful_syncs),
        failedSyncs: parseInt(row.failed_syncs),
        successRate:
          row.total_syncs > 0
            ? (
              (parseInt(row.successful_syncs) / parseInt(row.total_syncs)) *
                100
            ).toFixed(1)
            : '0.0'
      }));

      res.json({
        history,
        providerStats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Trigger manual sync
   */
  private async triggerSync(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!this.syncScheduler) {
        res.status(503).json({ error: 'Sync Scheduler not configured' });
        return;
      }

      const result = await this.syncScheduler.triggerSync();

      res.json({
        success: result.success,
        timestamp: result.timestamp,
        modelsDiscovered: result.modelsDiscovered,
        modelsUpdated: result.modelsUpdated,
        modelsDeprecated: result.modelsDeprecated,
        pricingUpdated: result.pricingUpdated,
        errors: result.errors
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Error handling middleware
   */
  private errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    console.error('Admin API Error:', error);

    res.status(500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'An error occurred'
    });
  }

  /**
   * Start the admin server
   */
  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`Admin Dashboard listening on port ${port}`);
        console.log(`Access at: http://localhost:${port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the admin server
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
          console.log('Admin Dashboard stopped');
          resolve();
        }
      });
    });
  }
}
