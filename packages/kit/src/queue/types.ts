import type { Job } from 'bullmq'

export type { Job }

export interface QueueConfig {
  redisUrl: string
}

export interface JobOptions {
  /** Delay in milliseconds before the job is processed */
  delay?: number
  /** Number of retry attempts */
  attempts?: number
  /** Backoff strategy configuration */
  backoff?: { type: 'exponential' | 'fixed', delay: number }
  /** Priority — lower values are processed first */
  priority?: number
  /** Custom job ID for deduplication */
  jobId?: string
}
