// Recover deleted admin projects from ai-tutor-cache
import fs from 'node:fs'
import { User } from '../app/src/models/User.mjs'
import ProjectCreationHandler from '../app/src/Features/Project/ProjectCreationHandler.mjs'
import ProjectEntityUpdateHandler from '../app/src/Features/Project/ProjectEntityUpdateHandler.mjs'

const CACHE_DIR = '/var/lib/overleaf/ai-tutor-cache'
const admin = await User.findOne({ email: 'jiaruiliu999@gmail.com' })

if (!admin) {
  console.error('Admin user not found')
  process.exit(1)
}

const oldProjectIds = [
  '698adb3b7ad77d8594fae055',
  '698d80c7ef11d81b8c4811a8',
  '698d8e9f7c30a5871de5efc1',
  '698d95a67c30a5871de5f1c6',
  '698dfb1a7c30a5871de5f70b',
  '698e1a677c30a5871de5f9d1',
  '698f50a37c30a5871de608cc',
  '69938a367c30a5871de63947',
  '6994af36db1d8711f625dcd4',
  '6997803edb1d8711f625fbb7',
  '69982b80a6c6f9eed91031f6',
  '699bddc5796fd335771e2f82',
]

for (const oldId of oldProjectIds) {
  const metaPath = CACHE_DIR + '/' + oldId + '/metadata.json'
  const texPath = CACHE_DIR + '/' + oldId + '/merged.tex'

  if (!fs.existsSync(metaPath) || !fs.existsSync(texPath)) {
    console.log('[skip] ' + oldId + ': missing cache files')
    continue
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  const title = meta.projectName || 'Recovered Project ' + oldId
  const texContent = fs.readFileSync(texPath, 'utf-8')
  const docLines = texContent.split('\n')

  const project = await ProjectCreationHandler.promises.createBlankProject(
    admin._id,
    title
  )
  const newId = project._id.toString()

  const { doc } = await ProjectEntityUpdateHandler.promises.addDoc(
    project._id,
    project.rootFolder[0]._id,
    'main.tex',
    docLines,
    admin._id,
    'recovery'
  )
  await ProjectEntityUpdateHandler.promises.setRootDoc(project._id, doc._id)

  // Copy cache to new project directory
  const newCacheDir = CACHE_DIR + '/' + newId
  fs.mkdirSync(newCacheDir, { recursive: true })

  for (const f of fs.readdirSync(CACHE_DIR + '/' + oldId)) {
    fs.copyFileSync(CACHE_DIR + '/' + oldId + '/' + f, newCacheDir + '/' + f)
  }

  // Update metadata with new project ID
  meta.projectId = newId
  fs.writeFileSync(newCacheDir + '/metadata.json', JSON.stringify(meta, null, 2))

  console.log('[restored] "' + title + '" old=' + oldId + ' new=' + newId)
}

console.log('Done!')
process.exit(0)
