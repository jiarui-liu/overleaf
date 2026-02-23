import {
  createContext,
  FC,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useProjectContext } from '@/shared/context/project-context'
import useIsAnnotationAccount from '@/shared/hooks/use-is-annotation-account'
import { AnnotationsMap, AnnotationRatings } from '../types/annotation'
import {
  fetchAnnotations,
  saveAnnotation as saveAnnotationApi,
} from '../utils/annotation-service'

type AnnotationContextValue = {
  annotations: AnnotationsMap
  setRating: (
    threadId: string,
    commentContent: string,
    dimension: keyof AnnotationRatings,
    value: number | null
  ) => void
}

const AnnotationContext = createContext<AnnotationContextValue | undefined>(
  undefined
)

export const AnnotationProvider: FC<React.PropsWithChildren> = ({
  children,
}) => {
  const isAnnotationAccount = useIsAnnotationAccount()
  const { projectId } = useProjectContext()
  const [annotations, setAnnotations] = useState<AnnotationsMap>({})

  useEffect(() => {
    if (!isAnnotationAccount) return
    fetchAnnotations(projectId)
      .then(data => setAnnotations(data))
      .catch(err => console.error('[Annotations] Failed to load:', err))
  }, [isAnnotationAccount, projectId])

  const setRating = useCallback(
    (
      threadId: string,
      commentContent: string,
      dimension: keyof AnnotationRatings,
      value: number | null
    ) => {
      if (!isAnnotationAccount) return

      setAnnotations(prev => {
        const existing = prev[threadId]
        const ratings: AnnotationRatings = existing
          ? { ...existing.ratings, [dimension]: value }
          : {
              validity: null,
              actionability: null,
              conciseness: null,
              [dimension]: value,
            }

        const updated: AnnotationsMap = {
          ...prev,
          [threadId]: {
            threadId,
            commentContent,
            ratings,
            timestamp: new Date().toISOString(),
            annotatorEmail: '',
          },
        }

        // Save in background
        saveAnnotationApi(projectId, threadId, commentContent, ratings).catch(
          err => console.error('[Annotations] Failed to save:', err)
        )

        return updated
      })
    },
    [isAnnotationAccount, projectId]
  )

  return (
    <AnnotationContext.Provider value={{ annotations, setRating }}>
      {children}
    </AnnotationContext.Provider>
  )
}

export const useAnnotationContext = () => {
  const context = useContext(AnnotationContext)
  if (!context) {
    throw new Error(
      'useAnnotationContext is only available inside AnnotationProvider'
    )
  }
  return context
}
