import { describe, expect, it } from 'vitest'
import { docTable } from './supabase'

describe('docTable', () => {
  it('keeps the shared marker in documents and a person own documents in user_documents', () => {
    expect(docTable('cutover_done')).toBe('documents')
    expect(docTable('web_trips')).toBe('user_documents')
    expect(docTable('way_id_map')).toBe('user_documents')
  })
})
