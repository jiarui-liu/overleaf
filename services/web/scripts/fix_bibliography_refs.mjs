// For papers that have a pre-compiled .bbl but no matching .bib,
// replace \bibliography{...} and \bibliographystyle{...} with \input{main.bbl}
// so LaTeX uses the pre-compiled bibliography directly.
//
// Usage: node scripts/fix_bibliography_refs.mjs --admin-email=jiaruiliu999@gmail.com

import fs from 'node:fs'
import path from 'node:path'
import parseArgs from 'minimist'
import { User } from '../app/src/models/User.mjs'
import ProjectGetter from '../app/src/Features/Project/ProjectGetter.mjs'
import ProjectEntityHandler from '../app/src/Features/Project/ProjectEntityHandler.mjs'
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

    const mergedPath = path.join(paperDir, 'merged.tex')
    if (!fs.existsSync(mergedPath)) continue

    const texContent = fs.readFileSync(mergedPath, 'utf-8')

    // Find \bibliography{...} references
    const bibMatch = texContent.match(/\\bibliography\{([^}]+)\}/)
    if (!bibMatch) {
      skipped++
      continue
    }

    // Check if ALL referenced .bib files exist
    const bibRefs = bibMatch[1].split(',').map(r => r.trim())
    let allBibsExist = true
    for (const ref of bibRefs) {
      // \bibliography{foo} looks for foo.bib; \bibliography{foo.bib} looks for foo.bib
      const bibFile = ref.endsWith('.bib') ? ref : ref + '.bib'
      if (!fs.existsSync(path.join(paperDir, bibFile))) {
        allBibsExist = false
        break
      }
    }

    if (allBibsExist) {
      skipped++
      continue
    }

    // Check that a .bbl file exists (we have pre-compiled bibliography)
    const bblFiles = fs.readdirSync(paperDir).filter(f => f.endsWith('.bbl'))
    if (bblFiles.length === 0) {
      skipped++
      continue
    }

    // Patch the tex: replace \bibliography{...} and \bibliographystyle{...} with \input{main.bbl}
    const lines = texContent.split('\n')
    const newLines = []
    let replaced = false

    for (const line of lines) {
      if (line.match(/^\s*\\bibliography\{/)) {
        if (!replaced) {
          newLines.push('\\input{main.bbl}')
          replaced = true
        }
        // skip this line
      } else if (line.match(/^\s*\\bibliographystyle\{/)) {
        // skip this line (not needed when using \input{main.bbl})
      } else {
        newLines.push(line)
      }
    }

    if (!replaced) {
      skipped++
      continue
    }

    // Update the doc in the project
    const project = await ProjectGetter.promises.getProject(projectId, {
      rootFolder: 1,
      name: 1,
    })
    if (!project) {
      console.log(`  [skip] ${hash}: project not found`)
      continue
    }

    try {
      await EditorController.promises.upsertDocWithPath(
        project._id,
        '/main.tex',
        newLines,
        'fix-bibliography-refs',
        admin._id
      )
      console.log(
        `  [fixed] "${project.name}" : replaced \\bibliography with \\input{main.bbl}`
      )
      fixed++
    } catch (err) {
      console.error(`  [error] "${project.name}": ${err.message}`)
    }
  }

  console.log(`\nDone: ${fixed} fixed, ${skipped} skipped (bib exists or no bibliography cmd)`)
}

try {
  await main()
  process.exit(0)
} catch (err) {
  console.error('Fatal:', err)
  process.exit(1)
}
