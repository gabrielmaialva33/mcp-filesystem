/**
 * Performance metrics tracking for MCP-Filesystem
 *
 * Provides:
 * - Operation timing
 * - Error counting
 * - Performance statistics
 * - Singleton pattern for global access
 */

/**
 * Metrics data for a single operation
 */
interface OperationMetricsData {
  count: number
  errors: number
  totalTime: number
}

/**
 * Result metrics format
 */
export interface MetricsResult {
  count: number
  errors: number
  avgTime: number
}

/**
 * Singleton metrics manager
 */
export class OperationMetrics {
  private static instance: OperationMetrics
  private operations: Record<string, OperationMetricsData> = {}
  private startTime: number

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.startTime = performance.now()
  }

  /**
   * Get singleton metrics instance
   */
  public static getInstance(): OperationMetrics {
    if (!OperationMetrics.instance) {
      OperationMetrics.instance = new OperationMetrics()
    }
    return OperationMetrics.instance
  }

  /**
   * Start timing an operation and return a function to end timing
   *
   * @param name Operation name
   * @returns Function to call when operation completes
   */
  public startOperation(name: string): () => void {
    if (!this.operations[name]) {
      this.operations[name] = { count: 0, errors: 0, totalTime: 0 }
    }

    const startTime = performance.now()
    this.operations[name].count++

    return () => {
      const endTime = performance.now()
      const duration = endTime - startTime
      this.operations[name].totalTime += duration
    }
  }

  /**
   * Record an error for an operation
   *
   * @param name Operation name
   */
  public recordError(name: string): void {
    if (!this.operations[name]) {
      this.operations[name] = { count: 0, errors: 0, totalTime: 0 }
    }

    this.operations[name].errors++
  }

  /**
   * Get metrics for all operations
   *
   * @returns Record of operation metrics
   */
  public getMetrics(): Record<string, MetricsResult> {
    const result: Record<string, MetricsResult> = {}

    for (const [name, data] of Object.entries(this.operations)) {
      result[name] = {
        count: data.count,
        errors: data.errors,
        avgTime: data.count > 0 ? data.totalTime / data.count : 0,
      }
    }

    // Add uptime metric
    result['uptime_ms'] = {
      count: 1,
      errors: 0,
      avgTime: performance.now() - this.startTime,
    }

    return result
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    this.operations = {}
    this.startTime = performance.now()
  }
}

/**
 * Global metrics instance
 */
export const metrics = OperationMetrics.getInstance()
