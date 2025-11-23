import { Request, Response, NextFunction } from 'express';

/**
 * API Gateway Interface
 * Handles REST API endpoints for the AI Council Proxy
 */
export interface IAPIGateway {
  /**
   * Submit a new request
   */
  submitRequest(req: Request, res: Response, next: NextFunction): Promise<void>;

  /**
   * Get request status and response
   */
  getRequest(req: Request, res: Response, next: NextFunction): Promise<void>;

  /**
   * Stream response using Server-Sent Events
   */
  streamRequest(req: Request, res: Response, next: NextFunction): Promise<void>;

  /**
   * Start the API server
   */
  start(port: number): Promise<void>;

  /**
   * Stop the API server
   */
  stop(): Promise<void>;
}
