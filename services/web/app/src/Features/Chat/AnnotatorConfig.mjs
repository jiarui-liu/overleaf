import fs from 'node:fs'
import path from 'node:path'

const MAPPING_DIR = '/var/lib/overleaf/ai-tutor-cache'
const MAPPING_FILE = path.join(MAPPING_DIR, 'paper_hash_mapping.json')

// Parse annotator emails from env
const annotatorEmails = new Set(
  (process.env.AI_TUTOR_ANNOTATION_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
)

// Build email → 1-based index mapping
const emailToIndex = new Map()
const emailList = Array.from(annotatorEmails)
emailList.forEach((email, i) => {
  emailToIndex.set(email, i + 1)
})

// Build email → paper hashes mapping
const emailToPapers = new Map()
for (const [email, index] of emailToIndex.entries()) {
  const paddedIndex = String(index).padStart(2, '0')
  const envKey = `AI_TUTOR_ANNOTATOR_${paddedIndex}_PAPERS`
  const raw = process.env[envKey] || ''
  const hashes = raw
    .split(';')
    .map(h => h.trim())
    .filter(Boolean)
  emailToPapers.set(email, hashes)
}

export function getAnnotatorEmails() {
  return annotatorEmails
}

export function isAnnotatorEmail(email) {
  if (!email) return false
  return annotatorEmails.has(email.toLowerCase())
}

export function getAnnotatorPaperHashes(email) {
  if (!email) return []
  return emailToPapers.get(email.toLowerCase()) || []
}

export function getAnnotatorIndex(email) {
  if (!email) return null
  return emailToIndex.get(email.toLowerCase()) || null
}

export function getPaperHashMapping() {
  try {
    const data = fs.readFileSync(MAPPING_FILE, 'utf-8')
    return new Map(Object.entries(JSON.parse(data)))
  } catch {
    return new Map()
  }
}

export function savePaperHashMapping(mapping) {
  fs.mkdirSync(MAPPING_DIR, { recursive: true })
  const obj = Object.fromEntries(mapping)
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(obj, null, 2))
}

export function getAllowedProjectIds(email) {
  const hashes = getAnnotatorPaperHashes(email)
  if (hashes.length === 0) return null
  const mapping = getPaperHashMapping()
  const projectIds = new Set()
  for (const hash of hashes) {
    const projectId = mapping.get(hash)
    if (projectId) {
      projectIds.add(projectId)
    }
  }
  return projectIds
}
