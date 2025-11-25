/**
 * Sync Scheduler Interface
 *
 * Responsible for scheduling and executing model/pricing synchronization jobs
 */

import { SyncResult, SyncStatus } from '../types/core';

export interface ISyncScheduler {
    /**
     * Start the sync scheduler
     *
     * @returns Promise resolving when scheduler is started
     */
    start(): Promise<void>;

    /**
     * Stop the sync scheduler
     *
     * @returns Promise resolving when scheduler is stopped
     */
    stop(): Promise<void>;

    /**
     * Manually trigger a sync job
     *
     * @returns Promise resolving to sync result
     */
    triggerSync(): Promise<SyncResult>;

    /**
     * Get the status of the last sync
     *
     * @returns Promise resolving to sync status
     */
    getLastSyncStatus(): Promise<SyncStatus>;
}
