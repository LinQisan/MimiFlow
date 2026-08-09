export const DOMAIN_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'STORAGE_ERROR',
  'INTERNAL_ERROR',
] as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number]

export type DomainErrorDetails = Record<string, string[]>

export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly details?: DomainErrorDetails

  constructor(
    code: DomainErrorCode,
    message: string,
    options?: { cause?: unknown; details?: DomainErrorDetails },
  ) {
    super(message, { cause: options?.cause })
    this.name = 'DomainError'
    this.code = code
    this.details = options?.details
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

export function toDomainError(
  error: unknown,
  fallbackMessage = '操作失败，请稍后重试。',
): DomainError {
  if (isDomainError(error)) return error
  return new DomainError('INTERNAL_ERROR', fallbackMessage, { cause: error })
}
