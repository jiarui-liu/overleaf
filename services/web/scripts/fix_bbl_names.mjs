// Fix .bbl file naming: when root doc is main.tex but the .bbl has a different name,
// add a copy named main.bbl so compilation finds the bibliography.
//
// Usage: node scripts/fix_bbl_names.mjs --admin-email=jiaruiliu999@gmail.com

import fs from 'node:fs'
import path from 'node:path'
import parseArgs from 'minimist'
import { User } from '../app/src/models/User.mjs'
import ProjectGetter from '../app/src/Features/Project/ProjectGetter.mjs'
import EditorController from '../app/src/Features/Editor/EditorController.mjs'
import {
  getPaperHashMapping,
} from '../app/src/Features/Chat/AnnotatorConfig.mjs'

const argv = parseArgs(process.argv.slice(2), {
  string: ['admin-email', 'papers-dir'],
})

const ADMIN_EMAIL = argv['admin-email'] || 'jiaruiliu999@gmail.com'
const PAPERS_DIR = argv['papers-dir'] || '/var/lib/overleaf/papers_source'

async function main() {
  const admin = await User.findOne({ email: ADMIN_EMAIL })
  if (!admin) {
    console.error('Admin not found')
    process.exit(1)
  }

  const mapping = getPaperHashMapping()
  let fixed = 0
  let skipped = 0

  for (const [hash, projectId] of mapping.entries()) {
    const paperDir = path.join(PAPERS_DIR, hash)
    if (!fs.existsSync(paperDir)) continue

    // Find .bbl files in the source paper
    const files = fs.readdirSync(paperDir)
    const bblFiles = files.filter(f => f.endsWith('.bbl'))

    // Skip if no bbl, or already has main.bbl
    if (bblFiles.length === 0 || bblFiles.includes('main.bbl')) {
      continue
    }

    // Check if project already has a main.bbl doc
    const project = await ProjectGetter.promises.getProject(projectId, {
      rootFolder: 1,
      name: 1,
    })
    if (!project) {
      console.log(`  [skip] ${hash}: project ${projectId} not found`)
      continue
    }

    const existingDocs = project.rootFolder[0].docs.map(d => d.name)
    if (existingDocs.includes('main.bbl')) {
      skipped++
      continue
    }

    // Read the first .bbl file and add as main.bbl
    const bblSource = path.join(paperDir, bblFiles[0])
    const bblContent = fs.readFileSync(bblSource, 'utf-8')
    const lines = bblContent.split('\n')

    try {
      await EditorController.promises.upsertDocWithPath(
        project._id,
        '/main.bbl',
        lines,
        'fix-bbl-names',
        admin._id
      )
      console.log(
        `  [fixed] "${project.name}" : ${bblFiles[0]} -> main.bbl`
      )
      fixed++
    } catch (err) {
      console.error(
        `  [error] "${project.name}": ${err.message}`
      )
    }
  }

  console.log(`\nDone: ${fixed} fixed, ${skipped} already had main.bbl`)
}

try {
  await main()
  process.exit(0)
} catch (err) {
  console.error('Fatal:', err)
  process.exit(1)
}
