import getMeta from '@/utils/meta'

export default function useIsAnnotationAccount(): boolean {
  return getMeta('ol-isAnnotationAccount') ?? false
}
