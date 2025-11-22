/**
 * REST API Gateway
 * Handles HTTP endpoints for submitting requests and retrieving results
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'crypto';
import { Server } from 'http';
import { RedisClientType } from 'redis';
import { Pool } from 'pg';

import { IAPIGateway } from '../interfaces/IAPIGateway';
import { IOrchestrationEngine } from '../interfaces/IOrchestrationEngine';
import { ISessionManager } from '../interfaces/ISessionManager';
import { IEventLogger } from '../interfaces/IEventLogger';
import {
  APIRequestBody,
  APIResponse,
  UserRequest,
  ConsensusDecision,
  ErrorResponse
} from '../types/core';

/**
 * Request storage for tracking in-progress and completed requests
 */
interface StoredRequest {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  consensusDecision?: ConsensusDecision;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Extended Express Request with user authentication
 */
interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * API Gateway implementation
 */
export class APIGateway implements IAPIGateway {
  private app: Express;
  private server?: Server;
  private orchestrationEngine: IOrchestrationEngine;
  private sessionManager: ISessionManager;
  private eventLogger: IEventLogger;
  private jwtSecret: string;
  private redis: RedisClientType;
  private dbPool: Pool;

  // Streaming connections
  private streamingConnections: Map<string, Response[]> = new Map();

  constructor(
    orchestrationEngine: IOrchestrationEngine,
    sessionManager: ISessionManager,
    eventLogger: IEventLogger,
    redis: RedisClientType,
    dbPool: Pool,
    jwtSecret?: string
  ) {
    this.app = express();
    this.orchestrationEngine = orchestrationEngine;
    this.sessionManager = sessionManager;
    this.eventLogger = eventLogger;
    this.redis = redis;
    this.dbPool = dbPool;

    // Require JWT_SECRET environment variable in production
    if (!jwtSecret && !process.env.JWT_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
      }
      // Only allow default in development
      console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET environment variable in production!');
      this.jwtSecret = 'default-secret-change-in-production';
    } else {
      this.jwtSecret = jwtSecret || process.env.JWT_SECRET!;
    }

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(cors());

    // JSON body parser
    this.app.use(express.json());

    // Rate limiting (disabled in test mode)
    const isTestMode = process.env.NODE_ENV === 'test';
    if (!isTestMode) {
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again later'
      });
      this.app.use('/api/', limiter);
    }

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // API v1 routes
    this.app.post('/api/v1/requests',
      this.authenticateRequest.bind(this),
      this.validateRequestBody.bind(this),
      this.submitRequest.bind(this)
    );

    this.app.get('/api/v1/requests/:requestId',
      this.authenticateRequest.bind(this),
      this.getRequest.bind(this)
    );

    this.app.get('/api/v1/requests/:requestId/stream',
      this.authenticateRequest.bind(this),
      this.streamRequest.bind(this)
    );

    // Error handling middleware
    this.app.use(this.errorHandler.bind(this));
  }

  /**
   * Authentication middleware
   */
  private async authenticateRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || authHeader.trim().length === 0) {
      res.status(401).json(this.createErrorResponse(
        'AUTHENTICATION_REQUIRED',
        'Authorization header is required',
        undefined,
        false
      ));
      return;
    }

    const trimmedAuth = authHeader.trim();

    // Support both JWT and API key authentication
    if (trimmedAuth.startsWith('Bearer ')) {
      // JWT authentication
      const token = trimmedAuth.substring(7).trim();

      if (token.length === 0) {
        res.status(401).json(this.createErrorResponse(
          'INVALID_AUTH_FORMAT',
          'Bearer token cannot be empty',
          undefined,
          false
        ));
        return;
      }

      try {
        const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
        req.userId = decoded.userId;
        next();
      } catch (error) {
        res.status(401).json(this.createErrorResponse(
          'INVALID_TOKEN',
          'Invalid or expired authentication token',
          undefined,
          false
        ));
      }
    } else if (trimmedAuth.startsWith('ApiKey ')) {
      // API key authentication
      const apiKey = trimmedAuth.substring(7).trim();

      if (apiKey.length === 0) {
        res.status(401).json(this.createErrorResponse(
          'INVALID_AUTH_FORMAT',
          'API key cannot be empty',
          undefined,
          false
        ));
        return;
      }

      // Validate API key (in production, check against database)
      if (await this.validateApiKey(apiKey)) {
        req.userId = await this.getUserIdFromApiKey(apiKey);
        next();
      } else {
        res.status(401).json(this.createErrorResponse(
          'INVALID_API_KEY',
          'Invalid API key',
          undefined,
          false
        ));
      }
    } else {
      res.status(401).json(this.createErrorResponse(
        'INVALID_AUTH_FORMAT',
        'Authorization header must be in format "Bearer <token>" or "ApiKey <key>"',
        undefined,
        false
      ));
    }
  }

  /**
   * Request body validation middleware
   * Includes input sanitization to prevent injection attacks
   */
  private validateRequestBody(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const body = req.body as APIRequestBody;

    if (!body.query || typeof body.query !== 'string') {
      res.status(400).json(this.createErrorResponse(
        'INVALID_REQUEST',
        'Request body must include a "query" field of type string',
        undefined,
        false
      ));
      return;
    }

    // Sanitize query input
    // Remove null bytes and control characters that could be used in injection attacks
    // Note: Preserve printable ASCII characters (0x20-0x7E) including punctuation
    // Preserve tab (0x09) and newline (0x0A) but remove all other control characters including carriage return (0x0D)
    let sanitizedQuery = body.query
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x08\x0B-\x0D\x0E-\x1F\x7F-\x9F]/g, ''); // Remove control characters but preserve \n (0x0A) and \t (0x09)
    sanitizedQuery = sanitizedQuery.trim();

    if (sanitizedQuery.length === 0) {
      res.status(400).json(this.createErrorResponse(
        'EMPTY_QUERY',
        'Query cannot be empty',
        undefined,
        false
      ));
      return;
    }

    // Validate query length to prevent DoS attacks
    const MAX_QUERY_LENGTH = 100000; // 100KB limit
    if (sanitizedQuery.length > MAX_QUERY_LENGTH) {
      res.status(400).json(this.createErrorResponse(
        'QUERY_TOO_LONG',
        `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
        undefined,
        false
      ));
      return;
    }

    // Replace original query with sanitized version
    body.query = sanitizedQuery;

    if (body.sessionId && typeof body.sessionId !== 'string') {
      res.status(400).json(this.createErrorResponse(
        'INVALID_SESSION_ID',
        'sessionId must be a string',
        undefined,
        false
      ));
      return;
    }

    // Sanitize sessionId if provided (UUID format validation)
    if (body.sessionId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(body.sessionId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_SESSION_ID',
          'sessionId must be a valid UUID',
          undefined,
          false
        ));
        return;
      }
    }

    if (body.streaming !== undefined && typeof body.streaming !== 'boolean') {
      res.status(400).json(this.createErrorResponse(
        'INVALID_STREAMING_FLAG',
        'streaming must be a boolean',
        undefined,
        false
      ));
      return;
    }

    next();
  }

  /**
   * Submit a new request
   */
  async submitRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body = req.body as APIRequestBody;
      const requestId = randomUUID();
      const userId = req.userId!;

      // Get or create session
      let sessionId = body.sessionId;
      if (!sessionId) {
        const session = await this.sessionManager.createSession(userId);
        sessionId = session.id;
      }

      // Get conversation context
      const context = await this.sessionManager.getContextForRequest(
        sessionId,
        4000 // max tokens for context
      );

      // Create user request
      const userRequest: UserRequest = {
        id: requestId,
        query: body.query,
        sessionId,
        context,
        timestamp: new Date()
      };

      // Store request as processing
      await this.saveRequest({
        id: requestId,
        status: 'processing',
        createdAt: new Date()
      });

      // Log request
      await this.eventLogger.logRequest(userRequest);

      // Process request asynchronously
      this.processRequestAsync(userRequest, body.streaming || false);

      // Return request ID immediately
      const response: APIResponse = {
        requestId,
        status: 'processing',
        createdAt: new Date()
      };

      res.status(202).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get request status and response
   */
  async getRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { requestId } = req.params;

      const storedRequest = await this.fetchRequest(requestId);

      if (!storedRequest) {
        res.status(404).json(this.createErrorResponse(
          'REQUEST_NOT_FOUND',
          `Request with ID ${requestId} not found`,
          undefined,
          false
        ));
        return;
      }

      const response: APIResponse = {
        requestId: storedRequest.id,
        status: storedRequest.status,
        consensusDecision: storedRequest.consensusDecision?.content,
        createdAt: storedRequest.createdAt,
        completedAt: storedRequest.completedAt
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Stream response using Server-Sent Events
   */
  async streamRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { requestId } = req.params;

      const storedRequest = await this.fetchRequest(requestId);

      if (!storedRequest) {
        res.status(404).json(this.createErrorResponse(
          'REQUEST_NOT_FOUND',
          `Request with ID ${requestId} not found`,
          undefined,
          false
        ));
        return;
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Register this connection for streaming
      if (!this.streamingConnections.has(requestId)) {
        this.streamingConnections.set(requestId, []);
      }
      this.streamingConnections.get(requestId)!.push(res);

      // If request is already completed, send the result immediately
      if (storedRequest.status === 'completed' && storedRequest.consensusDecision) {
        this.sendSSE(res, 'message', storedRequest.consensusDecision.content);
        this.sendSSE(res, 'done', 'Request completed');
        res.end();
        return;
      }

      if (storedRequest.status === 'failed') {
        this.sendSSE(res, 'error', storedRequest.error || 'Request failed');
        res.end();
        return;
      }

      // Send initial status
      this.sendSSE(res, 'status', 'processing');

      // Clean up on client disconnect
      req.on('close', () => {
        const connections = this.streamingConnections.get(requestId);
        if (connections) {
          const index = connections.indexOf(res);
          if (index > -1) {
            connections.splice(index, 1);
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Process request asynchronously
   */
  private async processRequestAsync(
    userRequest: UserRequest,
    streaming: boolean
  ): Promise<void> {
    try {
      // Process through orchestration engine
      const consensusDecision = await this.orchestrationEngine.processRequest(userRequest);

      // Update stored request
      const storedRequest = await this.fetchRequest(userRequest.id);
      if (storedRequest) {
        storedRequest.status = 'completed';
        storedRequest.consensusDecision = consensusDecision;
        storedRequest.completedAt = new Date();
        await this.saveRequest(storedRequest);
      }

      // Log consensus decision
      await this.eventLogger.logConsensusDecision(userRequest.id, consensusDecision);

      // Add to session history
      if (userRequest.sessionId) {
        await this.sessionManager.addToHistory(userRequest.sessionId, {
          role: 'user',
          content: userRequest.query,
          timestamp: userRequest.timestamp,
          requestId: userRequest.id
        });

        await this.sessionManager.addToHistory(userRequest.sessionId, {
          role: 'assistant',
          content: consensusDecision.content,
          timestamp: consensusDecision.timestamp,
          requestId: userRequest.id
        });
      }

      // Send to streaming connections if any
      if (streaming) {
        this.notifyStreamingConnections(userRequest.id, consensusDecision);
      }
    } catch (error) {
      // Update stored request with error
      const storedRequest = await this.fetchRequest(userRequest.id);
      if (storedRequest) {
        storedRequest.status = 'failed';
        storedRequest.error = (error as Error).message;
        storedRequest.completedAt = new Date();
        await this.saveRequest(storedRequest);
      }

      // Notify streaming connections of error
      if (streaming) {
        this.notifyStreamingError(userRequest.id, (error as Error).message);
      }

      console.error(`Error processing request ${userRequest.id}:`, error);
    }
  }

  /**
   * Notify streaming connections of completion
   */
  private notifyStreamingConnections(
    requestId: string,
    consensusDecision: ConsensusDecision
  ): void {
    const connections = this.streamingConnections.get(requestId);
    if (!connections) return;

    connections.forEach(res => {
      this.sendSSE(res, 'message', consensusDecision.content);
      this.sendSSE(res, 'done', 'Request completed');
      res.end();
    });

    // Clean up connections
    this.streamingConnections.delete(requestId);
  }

  /**
   * Notify streaming connections of error
   */
  private notifyStreamingError(requestId: string, error: string): void {
    const connections = this.streamingConnections.get(requestId);
    if (!connections) return;

    connections.forEach(res => {
      this.sendSSE(res, 'error', error);
      res.end();
    });

    // Clean up connections
    this.streamingConnections.delete(requestId);
  }

  /**
   * Send Server-Sent Event
   */
  private sendSSE(res: Response, event: string, data: string): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Validate API key against database
   */
  private async validateApiKey(apiKey: string): Promise<boolean> {
    if (!apiKey || apiKey.length === 0) {
      return false;
    }

    // In test/development mode, allow shorter keys for testing
    const isTestOrDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;
    
    if (!isTestOrDev && apiKey.length < 32) {
      return false;
    }

    try {
      // Hash the key for lookup
      const keyHash = createHash('sha256').update(apiKey).digest('hex');

      const result = await this.dbPool.query(
        'SELECT active, expires_at FROM api_keys WHERE key_hash = $1',
        [keyHash]
      );

      if (result.rows.length === 0) {
        // Fallback for development/testing if no keys in DB yet
        if (isTestOrDev) {
          return true;
        }
        return false;
      }

      const keyRecord = result.rows[0];

      if (!keyRecord.active) {
        return false;
      }

      if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating API key:', error);
      // In development/testing, allow if DB fails
      if (isTestOrDev) {
        return true;
      }
      return false;
    }
  }

  /**
   * Get user ID from API key
   */
  private async getUserIdFromApiKey(apiKey: string): Promise<string> {
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    try {
      const result = await this.dbPool.query(
        'SELECT user_id FROM api_keys WHERE key_hash = $1',
        [keyHash]
      );

      if (result.rows.length > 0) {
        return result.rows[0].user_id;
      }
    } catch (error) {
      console.error('Error getting user ID from API key:', error);
    }

    // Fallback: Use hash as user ID
    return `user-${keyHash.substring(0, 16)}`;
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    code: string,
    message: string,
    details?: any,
    retryable: boolean = false,
    requestId?: string
  ): ErrorResponse {
    return {
      error: {
        code,
        message,
        details,
        retryable
      },
      requestId,
      timestamp: new Date()
    };
  }

  /**
   * Error handling middleware
   * Prevents leaking internal implementation details to clients
   */
  private errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Log full error details server-side
    console.error('API Error:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      path: req.path,
      method: req.method
    });

    // Don't expose internal error details to clients
    // In production, provide generic error messages
    const isDevelopment = process.env.NODE_ENV === 'development';
    const errorMessage = isDevelopment
      ? error.message
      : 'An internal error occurred. Please try again later.';

    const errorResponse = this.createErrorResponse(
      'INTERNAL_ERROR',
      errorMessage,
      undefined,
      true
    );

    res.status(500).json(errorResponse);
  }

  /**
   * Save request to Redis
   */
  private async saveRequest(request: StoredRequest): Promise<void> {
    await this.redis.set(`request:${request.id}`, JSON.stringify(request));
    // Set TTL for 24 hours
    await this.redis.expire(`request:${request.id}`, 86400);
  }

  /**
   * Fetch request from Redis
   */
  private async fetchRequest(requestId: string): Promise<StoredRequest | null> {
    const data = await this.redis.get(`request:${requestId}`);
    if (!data) return null;

    const request = JSON.parse(data);

    // Restore Date objects
    request.createdAt = new Date(request.createdAt);
    if (request.completedAt) {
      request.completedAt = new Date(request.completedAt);
    }
    if (request.consensusDecision) {
      request.consensusDecision.timestamp = new Date(request.consensusDecision.timestamp);
    }

    return request;
  }

  /**
   * Start the API server
   */
  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`API Gateway listening on port ${port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the API server
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
          console.log('API Gateway stopped');
          resolve();
        }
      });
    });
  }
}
