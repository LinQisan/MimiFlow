import { z } from 'zod'

import { DomainError } from '../errors/domain-error.ts'

export const jsonRecordSchema = z.record(z.string(), z.unknown())
export const jsonRecordOrEmptySchema = jsonRecordSchema.catch({})
export const stringOrEmptySchema = z.string().catch('')
export const nullableStringSchema = z.string().nullable().catch(null)
export const booleanOrFalseSchema = z.boolean().catch(false)
export const finiteNumberSchema = z.coerce.number().finite()
export const stringArraySchema = z.array(z.string())

export const readJsonRecord = (value: unknown) =>
  jsonRecordOrEmptySchema.parse(value)

export const readOptionalJsonRecord = (value: unknown) => {
  const result = jsonRecordSchema.safeParse(value)
  return result.success ? result.data : null
}

export const readString = (value: unknown) => stringOrEmptySchema.parse(value)

export const readNullableString = (value: unknown) =>
  nullableStringSchema.parse(value)

export const readBoolean = (value: unknown) =>
  booleanOrFalseSchema.parse(value)

export const readStringArray = (value: unknown) =>
  stringArraySchema.catch([]).parse(value)

export function readFiniteNumber(value: unknown, fallback = 0): number {
  const result = finiteNumberSchema.safeParse(value)
  return result.success ? result.data : fallback
}

export function readInteger(value: unknown, fallback = 0): number {
  const result = z.coerce.number().finite().int().safeParse(value)
  return result.success ? result.data : fallback
}

export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input)
  if (result.success) return result.data

  const details: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form'
    details[key] = [...(details[key] ?? []), issue.message]
  }

  throw new DomainError(
    'VALIDATION_ERROR',
    result.error.issues[0]?.message || '输入内容不符合要求。',
    {
    cause: result.error,
    details,
    },
  )
}

export function formDataObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key)
    result[key] = values.length > 1 ? values : values[0]
  }
  return result
}
