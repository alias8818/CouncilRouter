/**
 * Admin Escalation Review Interface
 * Provides endpoints for reviewing and resolving escalations
 */

import express, { Express, Request, Response } from 'express';
import { IEscalationService } from '../interfaces/IEscalationService';

export class EscalationAdminInterface {
  private app: Express;

  constructor(private escalationService: IEscalationService) {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Get pending escalations
    this.app.get('/api/escalations/pending', async (req: Request, res: Response) => {
      try {
        const escalations = await this.escalationService.getPendingEscalations();
        res.json(escalations);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Resolve escalation
    this.app.post('/api/escalations/:id/resolve', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { reviewedBy, resolution } = req.body;

        if (!reviewedBy || !resolution) {
          res.status(400).json({ error: 'reviewedBy and resolution are required' });
          return;
        }

        await this.escalationService.resolveEscalation(id, reviewedBy, resolution);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });
  }

  /**
   * Get Express app for mounting
   */
  getApp(): Express {
    return this.app;
  }
}

