// Vocabulary management route (server wrapper).
//
// First-paint list + wordbook options are fetched here in parallel so the
// client workbench renders with data immediately instead of waiting for
// mount-time Server Action POSTs. All filtering, paging, editing and later
// mutations stay in the client component with the existing Server Actions.
import { getVocabulariesPagedAdmin } from '@/features/vocabulary/admin-actions'
import { listSelectableWordbooks } from '@/modules/knowledge/wordbooks/actions'
import VocabularyManageClient, {
  type VocabularyManageRecord,
} from './VocabularyManageClient'

// NOTE: keep in sync with PAGE_SIZE in VocabularyManageClient.tsx (the value
// cannot be imported from the client module: client exports are opaque
// references on the server and would arrive as undefined).
const INITIAL_PAGE_SIZE = 30

export default async function VocabularyManagePage() {
  const [paged, wordbooks] = await Promise.all([
    getVocabulariesPagedAdmin('', 1, INITIAL_PAGE_SIZE, 'all'),
    listSelectableWordbooks(),
  ])

  return (
    <VocabularyManageClient
      initialVocabList={paged.items as VocabularyManageRecord[]}
      initialTotalCount={paged.total || 0}
      initialWordbooks={wordbooks}
    />
  )
}
