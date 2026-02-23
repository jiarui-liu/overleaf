// Bulk import script for annotation papers.
// Creates annotator accounts, imports papers as Overleaf projects,
// adds annotators as collaborators on their assigned papers, and
// builds the paper_hash → projectId mapping.
//
// Usage (inside Docker container):
//   node scripts/import_annotation_papers.mjs [--admin-email=admin@example.com] [--papers-dir=/var/lib/overleaf/papers_source] [--dry-run]

import fs from 'node:fs'
import path from 'node:path'
import parseArgs from 'minimist'
import { User } from '../app/src/models/User.mjs'
import UserCreator from '../app/src/Features/User/UserCreator.mjs'
import AuthenticationManager from '../app/src/Features/Authentication/AuthenticationManager.mjs'
import ProjectCreationHandler from '../app/src/Features/Project/ProjectCreationHandler.mjs'
import ProjectEntityUpdateHandler from '../app/src/Features/Project/ProjectEntityUpdateHandler.mjs'
import CollaboratorsHandler from '../app/src/Features/Collaborators/CollaboratorsHandler.mjs'
import EditorController from '../app/src/Features/Editor/EditorController.mjs'
import {
  getAnnotatorEmails,
  getAnnotatorPaperHashes,
  savePaperHashMapping,
} from '../app/src/Features/Chat/AnnotatorConfig.mjs'

const argv = parseArgs(process.argv.slice(2), {
  string: ['admin-email', 'papers-dir'],
  boolean: ['dry-run'],
})

const ADMIN_EMAIL = argv['admin-email'] || 'admin@example.com'
const PAPERS_DIR = argv['papers-dir'] || '/var/lib/overleaf/papers_source'
const CACHE_DIR = '/var/lib/overleaf/ai-tutor-cache'
const DRY_RUN = argv['dry-run'] || false

// Parse passwords from env
const passwords = (process.env.AI_TUTOR_ANNOTATOR_PASSWORDS || '')
  .split(',')
  .map(p => p.trim())
  .filter(Boolean)

async function getOrCreateAdmin() {
  const admin = await User.findOne({ email: ADMIN_EMAIL })
  if (!admin) {
    console.error(
      `Admin user ${ADMIN_EMAIL} not found. Please create an admin account first.`
    )
    process.exit(1)
  }
  console.log(`Using admin user: ${admin.email} (${admin._id})`)
  return admin
}

async function createAnnotatorAccounts() {
  const emails = Array.from(getAnnotatorEmails())
  console.log(`\nCreating ${emails.length} annotator accounts...`)

  const accounts = new Map()

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]
    const password = passwords[i]

    if (!password) {
      console.error(`No password found for annotator ${email} (index ${i})`)
      continue
    }

    // Check if user already exists
    let user = await User.findOne({ email })
    if (user) {
      console.log(`  [skip] ${email} already exists (${user._id})`)
      accounts.set(email, user)
      continue
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] Would create ${email}`)
      continue
    }

    // Create user
    user = await UserCreator.promises.createNewUser({
      email,
      first_name: `Annotator ${String(i + 1).padStart(2, '0')}`,
      last_name: '',
    })
    console.log(`  [created] ${email} (${user._id})`)

    // Set password
    await AuthenticationManager.promises.setUserPassword(user, password)
    console.log(`  [password set] ${email}`)

    accounts.set(email, user)
  }

  return accounts
}

async function importPapers(adminUser) {
  // Collect all unique paper hashes from all annotators
  const allHashes = new Set()
  for (const email of getAnnotatorEmails()) {
    for (const hash of getAnnotatorPaperHashes(email)) {
      allHashes.add(hash)
    }
  }

  console.log(`\nImporting ${allHashes.size} papers as projects...`)

  const hashToProjectId = new Map()

  for (const hash of allHashes) {
    const paperDir = path.join(PAPERS_DIR, hash)

    if (!fs.existsSync(paperDir)) {
      console.error(`  [missing] Paper directory not found: ${paperDir}`)
      continue
    }

    // Read meta.json for paper title
    let title = hash
    const metaPath = path.join(paperDir, 'meta.json')
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        title = meta.title || hash
      } catch {
        console.warn(`  [warn] Failed to parse meta.json for ${hash}`)
      }
    }

    // Truncate title if too long (Overleaf has a 150 char limit for project names)
    if (title.length > 140) {
      title = title.slice(0, 137) + '...'
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] Would create project: "${title}" (${hash})`)
      continue
    }

    try {
      // Create blank project
      const project = await ProjectCreationHandler.promises.createBlankProject(
        adminUser._id,
        title
      )
      const projectId = project._id.toString()
      hashToProjectId.set(hash, projectId)
      console.log(`  [created] "${title}" => ${projectId}`)

      // Read merged.tex and add as root doc
      const mergedTexPath = path.join(paperDir, 'merged.tex')
      if (fs.existsSync(mergedTexPath)) {
        const texContent = fs.readFileSync(mergedTexPath, 'utf-8')
        const docLines = texContent.split('\n')
        const { doc } = await ProjectEntityUpdateHandler.promises.addDoc(
          project._id,
          project.rootFolder[0]._id,
          'main.tex',
          docLines,
          adminUser._id,
          'import-annotation-papers'
        )
        await ProjectEntityUpdateHandler.promises.setRootDoc(
          project._id,
          doc._id
        )
      }

      // Add all other files (non-json, non-tex, non-reviews)
      const files = fs.readdirSync(paperDir)
      for (const fileName of files) {
        // Skip files we already handled or don't want
        if (
          fileName === 'merged.tex' ||
          fileName === 'meta.json' ||
          fileName === 'flatten_meta.json' ||
          fileName === 'reviews.json'
        ) {
          continue
        }

        const filePath = path.join(paperDir, fileName)
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) continue

        // Sanitize filename: replace any characters that Overleaf disallows
        const safeName = fileName.replace(/[/\\*\x00-\x1f\x7f\x80-\x9f]/g, '_')
        if (safeName !== fileName) {
          console.log(`    [sanitized] "${fileName}" -> "${safeName}"`)
        }

        // Determine if it's a text doc (.tex, .bib, .bbl, .sty, .cls, .txt) or binary file
        const ext = path.extname(safeName).toLowerCase()
        const textExtensions = [
          '.tex',
          '.bib',
          '.bbl',
          '.sty',
          '.cls',
          '.txt',
          '.bst',
        ]

        try {
          if (textExtensions.includes(ext)) {
            // Add as doc (text file)
            const content = fs.readFileSync(filePath, 'utf-8')
            const lines = content.split('\n')
            await EditorController.promises.upsertDocWithPath(
              project._id,
              '/' + safeName,
              lines,
              'import-annotation-papers',
              adminUser._id
            )
          } else {
            // Add as binary file (images, etc.)
            await ProjectEntityUpdateHandler.promises.addFile(
              project._id,
              project.rootFolder[0]._id,
              safeName,
              filePath,
              null,
              adminUser._id,
              'import-annotation-papers'
            )
          }
        } catch (fileErr) {
          console.warn(
            `    [file-error] "${safeName}": ${fileErr.message}\n${fileErr.stack}`
          )
        }
      }

      // Copy files to ai-tutor-cache for the AI tutor
      const cacheProjectDir = path.join(CACHE_DIR, projectId)
      fs.mkdirSync(cacheProjectDir, { recursive: true })

      if (fs.existsSync(mergedTexPath)) {
        fs.copyFileSync(
          mergedTexPath,
          path.join(cacheProjectDir, 'merged.tex')
        )
      }
      if (fs.existsSync(metaPath)) {
        fs.copyFileSync(metaPath, path.join(cacheProjectDir, 'metadata.json'))
      }
    } catch (err) {
      console.error(`  [error] Failed to import ${hash}: ${err.message}`)
    }
  }

  return hashToProjectId
}

async function addCollaborators(accounts, hashToProjectId) {
  console.log('\nAdding annotators as collaborators...')

  for (const email of getAnnotatorEmails()) {
    const user = accounts.get(email)
    if (!user) {
      console.log(`  [skip] No account found for ${email}`)
      continue
    }

    const hashes = getAnnotatorPaperHashes(email)
    let added = 0
    for (const hash of hashes) {
      const projectId = hashToProjectId.get(hash)
      if (!projectId) {
        console.log(
          `  [skip] No project found for paper ${hash} (annotator ${email})`
        )
        continue
      }

      if (DRY_RUN) {
        console.log(
          `  [dry-run] Would add ${email} to project ${projectId} (${hash})`
        )
        continue
      }

      try {
        await CollaboratorsHandler.promises.addUserIdToProject(
          projectId,
          null,
          user._id,
          'readOnly'
        )
        added++
      } catch (err) {
        console.error(
          `  [error] Failed to add ${email} to ${projectId}: ${err.message}`
        )
      }
    }
    console.log(`  [done] ${email}: added to ${added}/${hashes.length} projects`)
  }
}

async function main() {
  console.log('=== Annotation Papers Import Script ===')
  console.log(`Papers directory: ${PAPERS_DIR}`)
  console.log(`Admin email: ${ADMIN_EMAIL}`)
  if (DRY_RUN) console.log('*** DRY RUN MODE ***')

  if (!fs.existsSync(PAPERS_DIR)) {
    console.error(`Papers directory not found: ${PAPERS_DIR}`)
    console.error(
      'Make sure the papers directory is mounted in docker-compose.yml'
    )
    process.exit(1)
  }

  const adminUser = await getOrCreateAdmin()

  // Step 1: Create annotator accounts
  const accounts = await createAnnotatorAccounts()

  // Step 2: Import papers as projects
  const hashToProjectId = await importPapers(adminUser)

  // Step 3: Save mapping
  if (!DRY_RUN && hashToProjectId.size > 0) {
    savePaperHashMapping(hashToProjectId)
    console.log(
      `\nSaved paper hash mapping (${hashToProjectId.size} entries) to ${CACHE_DIR}/paper_hash_mapping.json`
    )
  }

  // Step 4: Add collaborators
  await addCollaborators(accounts, hashToProjectId)

  console.log('\n=== Import complete ===')
}

try {
  await main()
  process.exit(0)
} catch (err) {
  console.error('Fatal error:', err)
  process.exit(1)
}
