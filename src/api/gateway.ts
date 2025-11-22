/**
 * REST API Gateway
 * Handles HTTP endpoints for submitting requests and retrieving results
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Server } from 'http';

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
  
  // In-memory request storage (in production, use Redis or database)
  private requests: Map<string, StoredRequest> = new Map();
  
  // Streaming connections
  private streamingConnections: Map<string, Response[]> = new Map();
  
  constructor(
    orchestrationEngine: IOrchestrationEngine,
    sessionManager: ISessionManager,
    eventLogger: IEventLogger,
    jwtSecret: string = process.env.JWT_SECRET || 'default-secret-change-in-production'
  ) {
    this.app = express();
    this.orchestrationEngine = orchestrationEngine;
    this.sessionManager = sessionManager;
    this.eventLogger = eventLogger;
    this.jwtSecret = jwtSecret;
    
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
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later'
    });
    this.app.use('/api/', limiter);
    
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
  private authenticateRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void {
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
      if (this.validateApiKey(apiKey)) {
        req.userId = this.getUserIdFromApiKey(apiKey);
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
    
    if (body.query.trim().length === 0) {
      res.status(400).json(this.createErrorResponse(
        'EMPTY_QUERY',
        'Query cannot be empty',
        undefined,
        false
      ));
      return;
    }
    
    if (body.sessionId && typeof body.sessionId !== 'string') {
      res.status(400).json(this.createErrorResponse(
        'INVALID_SESSION_ID',
        'sessionId must be a string',
        undefined,
        false
      ));
      return;
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
      this.requests.set(requestId, {
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
      
      const storedRequest = this.requests.get(requestId);
      
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
      
      const storedRequest = this.requests.get(requestId);
      
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
      const storedRequest = this.requests.get(userRequest.id);
      if (storedRequest) {
        storedRequest.status = 'completed';
        storedRequest.consensusDecision = consensusDecision;
        storedRequest.completedAt = new Date();
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
      const storedRequest = this.requests.get(userRequest.id);
      if (storedRequest) {
        storedRequest.status = 'failed';
        storedRequest.error = (error as Error).message;
        storedRequest.completedAt = new Date();
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
   * Validate API key (stub implementation)
   */
  private validateApiKey(apiKey: string): boolean {
    // In production, validate against database
    // For now, accept any non-empty key
    return apiKey.length > 0;
  }
  
  /**
   * Get user ID from API key (stub implementation)
   */
  private getUserIdFromApiKey(apiKey: string): string {
    // In production, look up user ID from database
    // For now, use a hash of the API key
    return `user-${apiKey.substring(0, 8)}`;
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
   */
  private errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    console.error('API Error:', error);
    
    const errorResponse = this.createErrorResponse(
      'INTERNAL_ERROR',
      error.message || 'An internal error occurred',
      undefined,
      true
    );
    
    res.status(500).json(errorResponse);
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
