/**
 * Debug Logger
 * Ensures debug logs are always visible in Docker logs
 */

// Force unbuffered output
if (process.stdout.isTTY === false) {
  process.stdout.setDefaultEncoding('utf8');
}
if (process.stderr.isTTY === false) {
  process.stderr.setDefaultEncoding('utf8');
}

export function debugLog(message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[DEBUG ${timestamp}] ${message}`;

  // Write to both stdout and stderr to ensure visibility
  process.stdout.write(logMessage + '\n');
  process.stderr.write(logMessage + '\n');

  if (data !== undefined) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    process.stdout.write(dataStr + '\n');
    process.stderr.write(dataStr + '\n');
  }

  // Force flush
  if (process.stdout.write('')) {
    process.stdout.emit('drain');
  }
  if (process.stderr.write('')) {
    process.stderr.emit('drain');
  }
}

export function debugError(message: string, error?: any): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[ERROR ${timestamp}] ${message}`;

  // Write to stderr (errors should go to stderr)
  process.stderr.write(logMessage + '\n');
  console.error(logMessage);

  if (error !== undefined) {
    const errorStr = error instanceof Error
      ? `${error.message}\n${error.stack}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error, null, 2);
    process.stderr.write(errorStr + '\n');
    console.error(errorStr);
  }

  // Force flush
  if (process.stderr.write('')) {
    process.stderr.emit('drain');
  }
}

