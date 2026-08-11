import {
  DomainError,
  type DomainErrorCode,
  type DomainErrorDetails,
  toDomainError,
} from '../errors/domain-error.ts'

type ActionError = {
  code: DomainErrorCode
  message: string
  details?: DomainErrorDetails
}

export type ActionResult<T extends object = Record<never, never>> =
  | ({
      success: true
      message?: string
      error?: never
    } & T)
  | {
      success: false
      message: string
      error: ActionError
    }

export function actionSuccess<T extends object = Record<never, never>>(
  payload?: T,
  message?: string,
): ActionResult<T> {
  return {
    success: true,
    ...(message ? { message } : {}),
    ...(payload ?? ({} as T)),
  }
}

export function actionFailure(
  error: DomainError | unknown,
  fallbackMessage?: string,
): ActionResult<never> {
  const domainError = toDomainError(error, fallbackMessage)
  return {
    success: false,
    message: domainError.message,
    error: {
      code: domainError.code,
      message: domainError.message,
      ...(domainError.details ? { details: domainError.details } : {}),
    },
  }
}

export async function executeAction<T extends object = Record<never, never>>(
  operation: () => Promise<T>,
  options?: { successMessage?: string; fallbackMessage?: string },
): Promise<ActionResult<T>> {
  try {
    const payload = await operation()
    return actionSuccess(payload, options?.successMessage)
  } catch (error) {
    return actionFailure(error, options?.fallbackMessage) as ActionResult<T>
  }
}
