export interface AnnotationRatings {
  validity: number | null
  actionability: number | null
  conciseness: number | null
}

export interface Annotation {
  threadId: string
  commentContent: string
  ratings: AnnotationRatings
  timestamp: string
  annotatorEmail: string
}

export type AnnotationsMap = Record<string, Annotation>
