/**
 * Structured Logger Utility
 * Provides clean, consistent logging throughout the application
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogContext {
  requestId?: string;
  component?: string;
  memberId?: string;
  model?: string;
  provider?: string;
  round?: number;
  step?: string;
  duration?: number;
  [key: string]: any;
}

export class Logger {
  private static instance: Logger;
  private minLevel: LogLevel = LogLevel.DEBUG;
  private enableTimestamps: boolean = true;
  private enableColors: boolean = true;

  private constructor() {
    // Check environment for log level
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && Object.values(LogLevel).includes(envLevel as LogLevel)) {
      this.minLevel = envLevel as LogLevel;
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getLevelPriority(level: LogLevel): number {
    const priorities: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3
    };
    return priorities[level];
  }

  private shouldLog(level: LogLevel): boolean {
    return this.getLevelPriority(level) >= this.getLevelPriority(this.minLevel);
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatContext(ctx: LogContext): string {
    const parts: string[] = [];

    if (ctx.requestId) {parts.push(`req=${ctx.requestId.substring(0, 8)}`);}
    if (ctx.component) {parts.push(`comp=${ctx.component}`);}
    if (ctx.memberId) {parts.push(`member=${ctx.memberId}`);}
    if (ctx.provider) {parts.push(`provider=${ctx.provider}`);}
    if (ctx.model) {parts.push(`model=${ctx.model}`);}
    if (ctx.round !== undefined) {parts.push(`round=${ctx.round}`);}
    if (ctx.step) {parts.push(`step=${ctx.step}`);}
    if (ctx.duration !== undefined) {parts.push(`duration=${ctx.duration}ms`);}

    return parts.length > 0 ? `[${parts.join(' | ')}]` : '';
  }

  private formatMessage(level: LogLevel, message: string, ctx?: LogContext, data?: any): string {
    const parts: string[] = [];

    if (this.enableTimestamps) {
      parts.push(this.formatTimestamp());
    }

    parts.push(`[${level}]`);

    if (ctx) {
      const contextStr = this.formatContext(ctx);
      if (contextStr) {parts.push(contextStr);}
    }

    parts.push(message);

    if (data !== undefined) {
      if (typeof data === 'string') {
        // Truncate long strings
        const maxLen = 500;
        parts.push(data.length > maxLen ? data.substring(0, maxLen) + '...' : data);
      } else {
        parts.push(JSON.stringify(data, null, 0));
      }
    }

    return parts.join(' ');
  }

  debug(message: string, ctx?: LogContext, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(LogLevel.DEBUG, message, ctx, data));
    }
  }

  info(message: string, ctx?: LogContext, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(LogLevel.INFO, message, ctx, data));
    }
  }

  warn(message: string, ctx?: LogContext, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, ctx, data));
    }
  }

  error(message: string, ctx?: LogContext, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message, ctx, data));
    }
  }

  // Convenience methods for common log patterns
  requestStart(requestId: string, query: string, preset?: string): void {
    this.info('═══════════════════════════════════════════════════════════════');
    this.info('REQUEST START', { requestId, component: 'Gateway' });
    this.info(`Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`, { requestId });
    if (preset) {
      this.info(`Preset: ${preset}`, { requestId });
    }
    this.info('───────────────────────────────────────────────────────────────');
  }

  requestComplete(requestId: string, duration: number, success: boolean): void {
    this.info('───────────────────────────────────────────────────────────────');
    const status = success ? '✅ SUCCESS' : '❌ FAILED';
    this.info(`REQUEST COMPLETE: ${status}`, { requestId, duration });
    this.info('═══════════════════════════════════════════════════════════════');
  }

  deliberationRoundStart(requestId: string, round: number, memberCount: number): void {
    this.info(`┌── DELIBERATION ROUND ${round} ──────────────────────────────────────`, { requestId });
    this.info(`│ Members participating: ${memberCount}`, { requestId, round });
  }

  deliberationRoundEnd(requestId: string, round: number, duration: number): void {
    this.info(`└── ROUND ${round} COMPLETE (${duration}ms) ─────────────────────────────`, { requestId, round, duration });
  }

  memberRequest(requestId: string, memberId: string, provider: string, model: string): void {
    this.debug('  ├─ Sending request', { requestId, memberId, provider, model });
  }

  memberResponse(requestId: string, memberId: string, success: boolean, duration: number, contentLength?: number): void {
    const status = success ? '✓' : '✗';
    this.info(`  ├─ ${status} Response received`, {
      requestId,
      memberId,
      duration,
      step: success ? `${contentLength} chars` : 'FAILED'
    });
  }

  memberError(requestId: string, memberId: string, error: string): void {
    this.error(`  ├─ ✗ Member failed: ${error}`, { requestId, memberId });
  }

  synthesisStart(requestId: string, strategy: string, exchangeCount: number): void {
    this.info('┌── SYNTHESIS ────────────────────────────────────────────────────', { requestId });
    this.info(`│ Strategy: ${strategy}`, { requestId });
    this.info(`│ Exchanges to process: ${exchangeCount}`, { requestId });
  }

  synthesisComplete(requestId: string, strategy: string, duration: number, confidence: string, contentLength: number): void {
    this.info(`│ Result: confidence=${confidence}, length=${contentLength} chars`, { requestId });
    this.info(`└── SYNTHESIS COMPLETE (${duration}ms) ─────────────────────────────`, { requestId, duration });
  }

  synthesisError(requestId: string, error: string): void {
    this.error(`│ SYNTHESIS ERROR: ${error}`, { requestId });
    this.error('└── SYNTHESIS FAILED ─────────────────────────────────────────────', { requestId });
  }

  metaSynthesisModeratorSelected(requestId: string, memberId: string, model: string): void {
    this.info(`│ Moderator selected: ${memberId} (${model})`, { requestId, memberId, model });
  }

  contentPreview(requestId: string, memberId: string, content: string): void {
    const preview = content.substring(0, 150).replace(/\n/g, ' ');
    this.debug(`  │   Preview: "${preview}${content.length > 150 ? '...' : ''}"`, { requestId, memberId });
  }

  apiCall(requestId: string, provider: string, model: string, endpoint: string): void {
    this.debug(`  ├─ API call: ${provider}/${model}`, { requestId, provider, model });
  }

  apiResponse(requestId: string, provider: string, status: number, duration: number): void {
    const statusIcon = status >= 200 && status < 300 ? '✓' : '✗';
    this.debug(`  ├─ ${statusIcon} API response: ${status} (${duration}ms)`, { requestId, provider, duration });
  }

  apiError(requestId: string, provider: string, status: number, error: string): void {
    this.error(`  ├─ ✗ API error: ${provider} returned ${status}`, { requestId, provider });
    this.error(`  │   ${error.substring(0, 200)}`, { requestId });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

