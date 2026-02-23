import { getJSON, postJSON } from '@/infrastructure/fetch-json'
import { AnnotationsMap, AnnotationRatings } from '../types/annotation'

export async function fetchAnnotations(
  projectId: string
): Promise<AnnotationsMap> {
  return getJSON(`/project/${projectId}/annotations`)
}

export async function saveAnnotation(
  projectId: string,
  threadId: string,
  commentContent: string,
  ratings: AnnotationRatings
): Promise<void> {
  await postJSON(`/project/${projectId}/annotations`, {
    body: { threadId, commentContent, ratings },
  })
}
