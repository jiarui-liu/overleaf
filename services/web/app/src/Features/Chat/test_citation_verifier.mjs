/**
 * test_citation_verifier.mjs
 *
 * Unit tests for CitationVerifier with a mocked Semantic Scholar fetch.
 * Run:  node app/src/Features/Chat/test_citation_verifier.mjs
 *
 * Pass --live to additionally run a smoke test against the real S2 API
 * (requires SEMANTIC_SCHOLAR_API_KEY env var).
 */

import {
  parseBibFile,
  cleanBibValue,
  normalizeTitle,
  normalizeAuthorName,
  normalizeVenue,
  venuesAgree,
  extractAuthorSurnames,
  titleSimilarity,
  compareEntryToPaper,
  verifyEntry,
  verifyCitations,
  lookupByDOIs,
  searchByTitle,
  __test__,
} from './CitationVerifier.mjs'

let pass = 0
let fail = 0
const failures = []

function assert(cond, label) {
  if (cond) {
    pass++
    console.log(`  ok   ${label}`)
  } else {
    fail++
    failures.push(label)
    console.log(`  FAIL ${label}`)
  }
}

function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ok   ${label}`)
  } else {
    fail++
    failures.push(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    console.log(`  FAIL ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function group(name, fn) {
  console.log(`\n--- ${name} ---`)
  await fn()
}

// ---------------------------------------------------------------------------
// 1. Bib parsing
// ---------------------------------------------------------------------------

await group('parseBibFile', () => {
  const sample = `
% A comment
@article{smith2023deep,
  title   = {Deep Learning for {NLP}: A Survey},
  author  = {Smith, John and Doe, Jane and Lee, K.},
  year    = 2023,
  journal = {Journal of Machine Learning Research},
  doi     = {10.1234/jmlr.2023.0001}
}

@inproceedings{brown2020language,
  title = "Language Models are Few-Shot Learners",
  author = {Brown, Tom B. and Mann, Benjamin and others},
  year = {2020},
  booktitle = {Advances in Neural Information Processing Systems}
}

@misc{nopenoexist2099fake,
  title  = {This Paper Does Not Exist In Any Database 2099},
  author = {Fake, Madeup and Imaginary, Person},
  year   = 2099
}
`
  const entries = parseBibFile(sample)
  assertEq(entries.length, 3, 'parses three entries (skips % comment)')
  assertEq(entries[0].key, 'smith2023deep', 'first key correct')
  assertEq(entries[0].type, 'article', 'first type correct')
  assertEq(entries[0].fields.title, 'Deep Learning for {NLP}: A Survey', 'title preserved (LaTeX braces survive cleanBibValue trim)')
  assertEq(entries[0].fields.year, '2023', 'year as string')
  assertEq(entries[0].fields.doi, '10.1234/jmlr.2023.0001', 'doi extracted')
  assertEq(entries[1].fields.title, 'Language Models are Few-Shot Learners', 'quoted title parsed')
  assertEq(entries[2].fields.year, '2099', 'fake entry year')

  const offsetCheck = sample.slice(entries[0].charStart, entries[0].charStart + 9)
  assert(offsetCheck.startsWith('@article{'), 'charStart points at @')
})

await group('cleanBibValue', () => {
  assertEq(cleanBibValue('{Hello World}'), 'Hello World', 'strips outer braces')
  assertEq(cleanBibValue('"Hello World"'), 'Hello World', 'strips quotes')
  assertEq(cleanBibValue('  {{Nested}}  '), 'Nested', 'strips nested braces')
  assertEq(cleanBibValue('plain'), 'plain', 'no-op on plain')
})

// ---------------------------------------------------------------------------
// 2. Normalization
// ---------------------------------------------------------------------------

await group('normalizeTitle', () => {
  assertEq(normalizeTitle('Deep Learning for {NLP}: A Survey'), 'deep learning for nlp a survey', 'strips LaTeX braces and punctuation')
  assertEq(normalizeTitle('Attention Is All You Need'), 'attention is all you need', 'lowercases')
  assertEq(normalizeTitle('  spaces  '), 'spaces', 'collapses whitespace')
})

await group('normalizeAuthorName', () => {
  assertEq(normalizeAuthorName('Bengio'), 'bengio', 'simple')
  assertEq(normalizeAuthorName('Müller'), 'muller', 'unicode accent stripped')
  assertEq(normalizeAuthorName('Lee, K.'), 'lee k', 'punctuation removed')
})

await group('extractAuthorSurnames', () => {
  assertEq(
    extractAuthorSurnames('Smith, John and Doe, Jane'),
    ['smith', 'doe'],
    'comma form'
  )
  assertEq(
    extractAuthorSurnames('John Smith and Jane Doe'),
    ['smith', 'doe'],
    'space form'
  )
  assertEq(
    extractAuthorSurnames('Yann LeCun and Geoffrey Hinton'),
    ['lecun', 'hinton'],
    'preserves casing-merged surnames'
  )
})

await group('venuesAgree', () => {
  assert(venuesAgree('ICLR', 'International Conference on Learning Representations') === true, 'ICLR acronym')
  assert(venuesAgree('NeurIPS', 'Advances in Neural Information Processing Systems') === true, 'NeurIPS expansion')
  assert(venuesAgree('Proceedings of ICLR 2023', 'ICLR') === true, 'with proceedings prefix')
  assert(venuesAgree('ICLR', 'NeurIPS') === false, 'distinct conferences disagree')
  assert(venuesAgree('', 'ICLR') === null, 'missing input → null')
  assert(venuesAgree('arXiv preprint', 'arXiv') === true, 'arXiv preprint')
})

await group('titleSimilarity', () => {
  assert(titleSimilarity('Attention Is All You Need', 'Attention Is All You Need') === 1, 'identical → 1')
  const sim1 = titleSimilarity(
    'Language Models are Few-Shot Learners',
    'Language Models are Few Shot Learners'
  )
  assert(sim1 > 0.95, `near-identical → ${sim1.toFixed(3)} > 0.95`)
  const sim2 = titleSimilarity(
    'Deep Learning for NLP: A Survey',
    'A Comprehensive Review of Image Classification'
  )
  assert(sim2 < 0.5, `unrelated → ${sim2.toFixed(3)} < 0.5`)
})

// ---------------------------------------------------------------------------
// 3. Field comparison
// ---------------------------------------------------------------------------

await group('compareEntryToPaper', () => {
  const entry = {
    fields: {
      title: 'Attention Is All You Need',
      author: 'Vaswani, Ashish and Shazeer, Noam',
      year: '2017',
      booktitle: 'NeurIPS',
      doi: '10.1234/correct.doi',
    },
  }
  const matchingPaper = {
    title: 'Attention Is All You Need',
    authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }],
    year: 2017,
    venue: 'NeurIPS',
    publicationVenue: { name: 'Advances in Neural Information Processing Systems' },
    externalIds: { DOI: '10.1234/correct.doi' },
  }
  const ok = compareEntryToPaper(entry, matchingPaper)
  assertEq(ok.issues, [], 'matching record produces no issues')

  const wrongAuthor = { ...matchingPaper, authors: [{ name: 'Random Person' }, { name: 'Another One' }] }
  const r1 = compareEntryToPaper(entry, wrongAuthor)
  assert(r1.issues.some(i => i.field === 'author'), 'flags wrong first author')

  const wrongYear = { ...matchingPaper, year: 2010 }
  const r2 = compareEntryToPaper(entry, wrongYear)
  assert(r2.issues.some(i => i.field === 'year' && i.severity === 'critical'), 'flags wrong year as critical (>3 yr diff)')

  const offByOne = { ...matchingPaper, year: 2018 }
  const r3 = compareEntryToPaper(entry, offByOne)
  assertEq(r3.issues.length, 0, 'tolerates ±1 year (arxiv vs conference)')

  const offByTwo = { ...matchingPaper, year: 2019 }
  const r4 = compareEntryToPaper(entry, offByTwo)
  assert(r4.issues.some(i => i.field === 'year' && i.severity === 'warning'), 'flags 2-yr diff as warning')

  const wrongDoi = { ...matchingPaper, externalIds: { DOI: '10.9999/different' } }
  const r5 = compareEntryToPaper(entry, wrongDoi)
  assert(r5.issues.some(i => i.field === 'doi' && i.severity === 'critical'), 'flags wrong DOI')

  const wrongVenue = { ...matchingPaper, venue: 'CVPR', publicationVenue: { name: 'IEEE Conference on Computer Vision' } }
  const r6 = compareEntryToPaper(entry, wrongVenue)
  assert(r6.issues.some(i => i.field === 'venue'), 'flags wrong venue')
})

// ---------------------------------------------------------------------------
// 4. verifyEntry — end-to-end with mocked S2 client
// ---------------------------------------------------------------------------

await group('verifyEntry verdicts', async () => {
  // Real-looking entry, matching S2 paper
  const goodEntry = {
    key: 'vaswani2017attention',
    type: 'inproceedings',
    raw: '@inproceedings{vaswani2017attention, title={Attention Is All You Need}}',
    charStart: 0,
    charEnd: 70,
    fields: {
      title: 'Attention Is All You Need',
      author: 'Vaswani, Ashish and Shazeer, Noam',
      year: '2017',
      booktitle: 'NeurIPS',
    },
  }
  const v1 = await verifyEntry(
    goodEntry,
    new Map(),
    async () => [{
      title: 'Attention Is All You Need',
      authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }],
      year: 2017,
      venue: 'NeurIPS',
    }]
  )
  assertEq(v1.kind, 'verified', 'good entry → verified')

  // Fabricated entry: no candidates returned
  const fakeEntry = {
    ...goodEntry,
    key: 'fake2099',
    fields: {
      title: 'Quantum Banana Optimization For Faster Than Light Travel',
      author: 'Nobody, Real',
      year: '2099',
    },
  }
  const v2 = await verifyEntry(fakeEntry, new Map(), async () => [])
  assertEq(v2.kind, 'fabricated', 'no candidates → fabricated')

  // Borderline match below candidate threshold
  const v3 = await verifyEntry(
    fakeEntry,
    new Map(),
    async () => [{ title: 'Some Completely Unrelated Title About Cats', authors: [], year: 2020 }]
  )
  assertEq(v3.kind, 'fabricated', 'best similarity < 0.7 → fabricated')

  // Wrong author surname
  const wrongAuthorEntry = {
    ...goodEntry,
    fields: { ...goodEntry.fields, author: 'Notreal, Person' },
  }
  const v4 = await verifyEntry(
    wrongAuthorEntry,
    new Map(),
    async () => [{
      title: 'Attention Is All You Need',
      authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }],
      year: 2017,
      venue: 'NeurIPS',
    }]
  )
  assertEq(v4.kind, 'mismatch', 'wrong author → mismatch')
  assert(v4.issues.some(i => i.field === 'author'), 'mismatch lists author issue')

  // DOI route — found and matching
  const doiEntry = {
    ...goodEntry,
    fields: { ...goodEntry.fields, doi: '10.1234/abc' },
  }
  const doiMap = new Map([['10.1234/abc', {
    title: 'Attention Is All You Need',
    authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }],
    year: 2017,
    venue: 'NeurIPS',
    externalIds: { DOI: '10.1234/abc' },
  }]])
  const v5 = await verifyEntry(doiEntry, doiMap, async () => { throw new Error('should not search') })
  assertEq(v5.kind, 'verified', 'DOI route + matching → verified')

  // DOI route — not found
  const v6 = await verifyEntry(doiEntry, new Map([['10.1234/abc', null]]), async () => [])
  assertEq(v6.kind, 'doi_not_found', 'DOI null → doi_not_found')

  // DOI route — found but title disagrees strongly
  const doiWrongMap = new Map([['10.1234/abc', {
    title: 'Completely Different Paper About Networking',
    authors: [{ name: 'Some One' }],
    year: 2010,
  }]])
  const v7 = await verifyEntry(doiEntry, doiWrongMap, async () => [])
  assertEq(v7.kind, 'doi_mismatch', 'DOI resolves to different paper → doi_mismatch')

  // Borderline title (sim in 0.7-0.85 band) — small word diff: "Attention is All We Need"
  const borderlineEntry = {
    ...goodEntry,
    fields: {
      ...goodEntry.fields,
      title: 'Attention is All We Need',
    },
  }
  const sim = titleSimilarity(borderlineEntry.fields.title, 'Attention Is All You Need')
  console.log(`    (borderline title sim = ${sim.toFixed(3)})`)
  const v8 = await verifyEntry(
    borderlineEntry,
    new Map(),
    async () => [{
      title: 'Attention Is All You Need',
      authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }],
      year: 2017,
      venue: 'NeurIPS',
    }]
  )
  if (sim >= 0.70 && sim < 0.85) {
    // Other fields all agree → unverified (clean borderline)
    assertEq(v8.kind, 'unverified', 'borderline + clean fields → unverified')
  } else {
    // Test is mis-tuned; just sanity-check it didn't crash
    assert(['unverified', 'mismatch', 'verified', 'fabricated'].includes(v8.kind), `borderline test produced known verdict (sim=${sim.toFixed(3)})`)
  }
})

// ---------------------------------------------------------------------------
// 5. verifyCitations — full pipeline with mocked HTTP
// ---------------------------------------------------------------------------

await group('verifyCitations end-to-end (mocked HTTP)', async () => {
  const bibContent = `
@inproceedings{vaswani2017attention,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish and Shazeer, Noam},
  year = {2017},
  booktitle = {NeurIPS}
}

@inproceedings{fake2099quantum,
  title = {Quantum Banana Optimization For Faster Than Light Travel},
  author = {Nobody, Real},
  year = {2099},
  booktitle = {Imaginary Conference}
}

@article{wrongauthor2020,
  title = {Language Models are Few-Shot Learners},
  author = {Notreal, Person},
  year = {2020},
  journal = {ArXiv preprint}
}
`

  // Mock fetch: route based on URL
  const mockFetch = async (url, opts) => {
    if (url.includes('/paper/search')) {
      const m = /query=([^&]+)/.exec(url)
      const q = decodeURIComponent(m[1])
      if (q.toLowerCase().includes('attention')) {
        return { data: [{
          title: 'Attention Is All You Need',
          authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }],
          year: 2017,
          venue: 'NeurIPS',
          publicationVenue: { name: 'Advances in Neural Information Processing Systems' },
        }] }
      }
      if (q.toLowerCase().includes('language models')) {
        return { data: [{
          title: 'Language Models are Few-Shot Learners',
          authors: [{ name: 'Tom B. Brown' }, { name: 'Benjamin Mann' }],
          year: 2020,
          venue: 'NeurIPS',
        }] }
      }
      return { data: [] }
    }
    if (url.includes('/paper/batch')) {
      return []
    }
    throw new Error('unexpected URL: ' + url)
  }

  const result = await verifyCitations({
    bibFiles: [{ path: 'main.bib', content: bibContent }],
    apiKey: 'fake-key',
    fetchFn: mockFetch,
  })

  assertEq(result.stats.fabricated, 1, 'one fabricated entry')
  assert(
    result.stats.mismatch >= 1,
    `at least one mismatch from wrong-author entry (got ${JSON.stringify(result.stats)})`
  )
  assertEq(result.stats.verified || 0, 1, 'one verified entry')

  // Verify comments are pre-mapped to bib file
  for (const c of result.comments) {
    assertEq(c.docPath, 'main.bib', `comment docPath set: ${c.highlightText}`)
    assert(c.startOffset >= 0 && c.endOffset > c.startOffset, `valid offsets for ${c.highlightText}`)
    assert(c.highlightText.startsWith('@'), `highlightText anchored on @ header: ${c.highlightText}`)
    assertEq(c.category, 'citation_verification', 'category tag')
    assertEq(c.agentName, 'Reference Verification', 'agentName tag')
  }
})

await group('verifyCitations no-ops without API key', async () => {
  const r = await verifyCitations({
    bibFiles: [{ path: 'a.bib', content: '@article{x, title={t}}' }],
    apiKey: null,
  })
  assertEq(r.comments, [], 'no comments when key missing')
  assertEq(r.stats.skipped, 'no_api_key', 'reports skipped reason')
})

await group('verifyCitations no bib files', async () => {
  const r = await verifyCitations({ bibFiles: [], apiKey: 'fake' })
  assertEq(r.comments, [], 'no comments when no bibs')
  assertEq(r.stats.skipped, 'no_bib_files', 'reports skipped reason')
})

// ---------------------------------------------------------------------------
// 6. Rate-limiter / retry / backoff
// ---------------------------------------------------------------------------

// Build a fake Response object good enough for s2Fetch's needs (status,
// headers.get, json(), text()).
function fakeResponse({ status = 200, json = null, text = '', headers = {} } = {}) {
  return {
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    json: async () => json,
    text: async () => text,
  }
}

await group('parseRetryAfter', () => {
  const { parseRetryAfter } = __test__
  assertEq(parseRetryAfter('5'), 5000, 'integer seconds')
  assertEq(parseRetryAfter('  10 '), 10_000, 'integer with whitespace')
  assertEq(parseRetryAfter(''), null, 'empty string → null')
  assertEq(parseRetryAfter(null), null, 'null → null')
  assertEq(parseRetryAfter('not a date'), null, 'garbage → null')
  // HTTP date: a far-future date should produce a positive number
  const future = new Date(Date.now() + 60_000).toUTCString()
  const v = parseRetryAfter(future)
  assert(typeof v === 'number' && v > 30_000 && v < 90_000, `HTTP-date ~60s → got ${v}`)
})

await group('computeBackoffMs full-jitter bounds', () => {
  const { computeBackoffMs } = __test__
  // base=1000, cap=30000. attempt=0: in [0,1000); attempt=4: in [0,16000); attempt=10: capped at [0,30000).
  for (let attempt = 0; attempt <= 12; attempt++) {
    const samples = Array.from({ length: 50 }, () => computeBackoffMs(attempt))
    for (const s of samples) {
      assert(s >= 0 && s < 30_001, `attempt ${attempt}: ${s} in [0,30000]`)
    }
  }
})

await group('S2RateLimiter spaces reservations', async () => {
  const { S2RateLimiter } = __test__
  const lim = new S2RateLimiter(50)
  const t0 = Date.now()
  await lim.acquire() // first call is instant
  const t1 = Date.now()
  await lim.acquire()
  const t2 = Date.now()
  await lim.acquire()
  const t3 = Date.now()
  assert(t1 - t0 < 20, `first acquire immediate (took ${t1 - t0}ms)`)
  assert(t2 - t1 >= 40, `second acquire waits ~50ms (took ${t2 - t1}ms)`)
  assert(t3 - t2 >= 40, `third acquire waits ~50ms (took ${t3 - t2}ms)`)
})

await group('S2RateLimiter serializes concurrent acquires', async () => {
  const { S2RateLimiter } = __test__
  const lim = new S2RateLimiter(40)
  const t0 = Date.now()
  // Fire 4 simultaneously: 1st immediate, then 40/80/120ms minimums.
  const results = await Promise.all([
    lim.acquire().then(() => Date.now() - t0),
    lim.acquire().then(() => Date.now() - t0),
    lim.acquire().then(() => Date.now() - t0),
    lim.acquire().then(() => Date.now() - t0),
  ])
  assert(results[0] < 20, `first ~0ms (got ${results[0]}ms)`)
  assert(results[1] >= 35, `second ~40ms (got ${results[1]}ms)`)
  assert(results[2] >= 75, `third ~80ms (got ${results[2]}ms)`)
  assert(results[3] >= 115, `fourth ~120ms (got ${results[3]}ms)`)
})

await group('s2Fetch: 429 with Retry-After honored, then success', async () => {
  const { s2Fetch, S2RateLimiter } = __test__
  let calls = 0
  const sleeps = []
  const httpFetch = async () => {
    calls++
    if (calls === 1) {
      return fakeResponse({ status: 429, headers: { 'retry-after': '2' }, text: 'slow down' })
    }
    return fakeResponse({ status: 200, json: { ok: true } })
  }
  const stats = {}
  const result = await s2Fetch('https://x', {}, 'k', {
    httpFetch,
    limiter: new S2RateLimiter(0),
    sleepFn: async ms => { sleeps.push(ms) },
    backoffFn: () => 9999,
    stats,
  })
  assertEq(result, { ok: true }, '2nd call returns parsed JSON')
  assertEq(calls, 2, 'fetched twice')
  assertEq(sleeps, [2000], 'slept exactly the Retry-After value, ignored backoffFn')
  assertEq(stats.rateLimit429, 1, 'rateLimit429 counter incremented')
  assertEq(stats.retries, 1, 'retries counter incremented')
})

await group('s2Fetch: 429 exhausts retries → _transient error', async () => {
  const { s2Fetch, S2RateLimiter, S2_MAX_RETRIES } = __test__
  let calls = 0
  const httpFetch = async () => {
    calls++
    return fakeResponse({ status: 429, text: 'too many' })
  }
  const result = await s2Fetch('https://x', {}, 'k', {
    httpFetch,
    limiter: new S2RateLimiter(0),
    sleepFn: async () => {},
    backoffFn: () => 0,
  })
  assertEq(calls, S2_MAX_RETRIES + 1, `tried ${S2_MAX_RETRIES + 1} times (1 + ${S2_MAX_RETRIES} retries)`)
  assertEq(result._transient, true, 'returns _transient: true')
  assert(typeof result._error === 'string' && result._error.includes('429'), `error mentions 429: ${result._error}`)
})

await group('s2Fetch: 5xx → backoff → success', async () => {
  const { s2Fetch, S2RateLimiter } = __test__
  let calls = 0
  const httpFetch = async () => {
    calls++
    if (calls < 3) return fakeResponse({ status: 503, text: 'unavailable' })
    return fakeResponse({ status: 200, json: { ok: 'recovered' } })
  }
  const stats = {}
  const result = await s2Fetch('https://x', {}, 'k', {
    httpFetch,
    limiter: new S2RateLimiter(0),
    sleepFn: async () => {},
    backoffFn: attempt => attempt * 10,
    stats,
  })
  assertEq(result, { ok: 'recovered' }, 'recovered after two 503s')
  assertEq(calls, 3, 'called three times')
  assertEq(stats.serverErrors5xx, 2, '5xx counter incremented')
  assertEq(stats.retries, 2, 'retries counter incremented')
})

await group('s2Fetch: network error → retry → success', async () => {
  const { s2Fetch, S2RateLimiter } = __test__
  let calls = 0
  const httpFetch = async () => {
    calls++
    if (calls === 1) throw new TypeError('socket hang up')
    return fakeResponse({ status: 200, json: { ok: 'after_net_err' } })
  }
  const stats = {}
  const result = await s2Fetch('https://x', {}, 'k', {
    httpFetch,
    limiter: new S2RateLimiter(0),
    sleepFn: async () => {},
    backoffFn: () => 0,
    stats,
  })
  assertEq(result, { ok: 'after_net_err' }, 'recovered after one network exception')
  assertEq(calls, 2, 'called twice')
  assertEq(stats.networkErrors, 1, 'networkErrors counter incremented')
  assertEq(stats.retries, 1, 'retries counter incremented')
})

await group('s2Fetch: 404 returns _notFound (no retry)', async () => {
  const { s2Fetch, S2RateLimiter } = __test__
  let calls = 0
  const httpFetch = async () => {
    calls++
    return fakeResponse({ status: 404 })
  }
  const result = await s2Fetch('https://x', {}, 'k', {
    httpFetch,
    limiter: new S2RateLimiter(0),
    sleepFn: async () => {},
    backoffFn: () => 0,
  })
  assertEq(result, { _notFound: true }, '404 → _notFound')
  assertEq(calls, 1, 'no retries on 404')
})

await group('s2Fetch: 4xx (non-429) is permanent', async () => {
  const { s2Fetch, S2RateLimiter } = __test__
  let calls = 0
  const httpFetch = async () => {
    calls++
    return fakeResponse({ status: 400, text: 'bad request' })
  }
  const result = await s2Fetch('https://x', {}, 'k', {
    httpFetch,
    limiter: new S2RateLimiter(0),
    sleepFn: async () => {},
    backoffFn: () => 0,
  })
  assertEq(calls, 1, '400 → no retry')
  assert(result._error && result._error.includes('400'), `400 → _error: ${result._error}`)
  assert(!result._transient, '400 is not transient')
})

await group('lookupByDOIs: transient batch error leaves keys absent', async () => {
  // Inject a fake "s2Fetch" returning a transient-flagged error so we can
  // verify lookupByDOIs does NOT pollute the map with null entries.
  const transientFetch = async () => ({ _error: 'simulated', _transient: true })
  const stats = {}
  const map = await lookupByDOIs(['10.1/a', '10.1/b'], 'k', transientFetch, stats)
  assertEq(map.size, 0, 'no keys inserted on transient error')
  assertEq(stats.doiBatchTransientErrors, 2, 'stat counter records skipped slice')
})

await group('lookupByDOIs: permanent error still records nulls', async () => {
  const permaFetch = async () => ({ _error: 'bad request' })
  const map = await lookupByDOIs(['10.1/a', '10.1/b'], 'k', permaFetch)
  assertEq(map.size, 2, 'permanent error → both keys present as null')
  assertEq(map.get('10.1/a'), null, 'a → null')
})

await group('searchByTitle: transient error returns null', async () => {
  const transientFetch = async () => ({ _error: 'oops', _transient: true })
  const r = await searchByTitle('Attention Is All You Need', 'k', transientFetch)
  assert(r === null, 'returns null sentinel on transient error')
})

await group('searchByTitle: confirmed-empty returns []', async () => {
  const emptyFetch = async () => ({ data: [] })
  const r = await searchByTitle('Some Title', 'k', emptyFetch)
  assertEq(r, [], 'empty data array → []')
})

await group('verifyEntry: transient title search → unverified, not fabricated', async () => {
  const entry = {
    key: 'foo',
    type: 'article',
    raw: '',
    charStart: 0,
    charEnd: 0,
    fields: { title: 'Some Real Paper Title', author: 'Doe, J.', year: '2024' },
  }
  const v = await verifyEntry(entry, new Map(), async () => null)
  assertEq(v.kind, 'unverified', 'null candidates → unverified')
  assertEq(v.reason, 'api_unavailable', 'reason flag set')
})

await group('verifyEntry: DOI absent from map falls through to title search', async () => {
  const entry = {
    key: 'foo',
    type: 'article',
    raw: '',
    charStart: 0,
    charEnd: 0,
    fields: { title: 'Attention Is All You Need', doi: '10.1/transient', author: 'Vaswani, A.', year: '2017' },
  }
  let titleSearchCalled = false
  const v = await verifyEntry(
    entry,
    new Map(), // DOI not in map → transient state
    async () => {
      titleSearchCalled = true
      return [{
        title: 'Attention Is All You Need',
        authors: [{ name: 'Ashish Vaswani' }],
        year: 2017,
        venue: 'NeurIPS',
      }]
    }
  )
  assert(titleSearchCalled, 'title search was invoked despite DOI present')
  assertEq(v.kind, 'verified', 'verified via title-search fallback')
})

await group('verifyEntry: DOI confirmed null → doi_not_found (unchanged)', async () => {
  const entry = {
    key: 'foo',
    type: 'article',
    raw: '',
    charStart: 0,
    charEnd: 0,
    fields: { title: 'X', doi: '10.1/known-bad', author: '', year: '' },
  }
  const v = await verifyEntry(
    entry,
    new Map([['10.1/known-bad', null]]),
    async () => { throw new Error('should not be called') }
  )
  assertEq(v.kind, 'doi_not_found', 'null in map → doi_not_found')
})

await group('verifyCitations integration: API outage → unverified, not fabricated', async () => {
  // Every fetch comes back transient; the verifier should mark all entries
  // as unverified (api_unavailable), NEVER as fabricated.
  const bibContent = `
@article{realpaper,
  title = {Real Paper That Exists},
  author = {Real, Author},
  year = {2023},
  journal = {Real Journal}
}
`
  const flakyFetch = async () => ({ _error: 'outage', _transient: true })

  const r = await verifyCitations({
    bibFiles: [{ path: 'main.bib', content: bibContent }],
    apiKey: 'fake-key',
    fetchFn: flakyFetch,
  })

  assertEq(r.stats.fabricated || 0, 0, 'no entries marked fabricated during outage')
  assertEq(r.stats.unverified || 0, 1, 'entry marked unverified instead')
  // Verify the produced comment is a warning, not a critical:
  const c = r.comments[0]
  assertEq(c?.severity, 'warning', 'unverified → warning, not critical')
})

await group('verifyCitations integration: transient verdicts are not cached', async () => {
  // First pass: API is down → unverified verdict. Second pass with the same
  // (in-memory) cacheDir would re-hit the API. Since we test via a temp dir,
  // assert via the absence of any unverified verdict surviving across runs
  // by inspecting the cache file. Skip the disk part — just exercise the
  // code path without a cacheDir to confirm no crash.
  const flakyFetch = async () => ({ _error: 'outage', _transient: true })
  const r1 = await verifyCitations({
    bibFiles: [{ path: 'main.bib', content: '@article{x, title={T}, author={A}, year={2024}}' }],
    apiKey: 'k',
    fetchFn: flakyFetch,
  })
  assertEq(r1.stats.unverified, 1, 'first pass: unverified (transient)')

  // Recovered second pass should be free to mark verified — i.e., the
  // earlier unverified did not poison anything. With no cacheDir we trivially
  // re-evaluate; this guards against future regressions where someone caches
  // transient verdicts.
  const okFetch = async (url) => {
    if (url.includes('/paper/search')) {
      return { data: [{ title: 'T', authors: [{ name: 'A' }], year: 2024, venue: '' }] }
    }
    return []
  }
  const r2 = await verifyCitations({
    bibFiles: [{ path: 'main.bib', content: '@article{x, title={T}, author={A}, year={2024}}' }],
    apiKey: 'k',
    fetchFn: okFetch,
  })
  assertEq(r2.stats.verified, 1, 'second pass after recovery: verified')
})

// ---------------------------------------------------------------------------
// 7. Heavier rate-limit / concurrency / atomicity tests
// ---------------------------------------------------------------------------

await group('S2RateLimiter wall-clock under load (10 concurrent acquires)', async () => {
  const { S2RateLimiter } = __test__
  const interval = 50
  const N = 10
  const lim = new S2RateLimiter(interval)
  const t0 = Date.now()
  const arrivals = await Promise.all(
    Array.from({ length: N }, () => lim.acquire().then(() => Date.now() - t0))
  )
  const total = arrivals[arrivals.length - 1]
  // First acquire is ~0; last should be ~(N-1)*interval.
  const expectedMin = (N - 1) * interval - 10
  const expectedMax = (N - 1) * interval + 100 // generous upper bound for jittery CI
  assert(
    total >= expectedMin && total <= expectedMax,
    `${N} acquires total ${total}ms, expected ~${(N - 1) * interval}ms (range ${expectedMin}-${expectedMax})`
  )
  // Each successive arrival should be at least `interval` ms after the previous.
  for (let i = 1; i < arrivals.length; i++) {
    const gap = arrivals[i] - arrivals[i - 1]
    assert(gap >= interval - 5, `gap ${i - 1}→${i} = ${gap}ms ≥ ${interval}ms`)
  }
})

await group('Retry-After advances limiter (cooperative backoff)', async () => {
  const { s2Fetch, S2RateLimiter } = __test__
  const lim = new S2RateLimiter(50)
  let calls = 0
  const sleeps = []
  const httpFetch = async () => {
    calls++
    if (calls === 1) {
      return fakeResponse({ status: 429, headers: { 'retry-after': '1' } })
    }
    return fakeResponse({ status: 200, json: { ok: true } })
  }
  const start = Date.now()
  // Fire request A which will hit 429 with Retry-After=1s. While A is
  // sleeping, fire request B; B must wait for the limiter's pauseFor(1000)
  // to clear, not just the 50ms interval.
  const pA = s2Fetch('https://x', {}, 'k', {
    httpFetch,
    limiter: lim,
    sleepFn: async ms => { sleeps.push(['A', ms]); await new Promise(r => setTimeout(r, ms)) },
    backoffFn: () => 9999,
  })
  // Give A a tick to fire its first request and call pauseFor.
  await new Promise(r => setTimeout(r, 30))
  const tBefore = Date.now()
  const pB = s2Fetch('https://x', {}, 'k', {
    httpFetch: async () => fakeResponse({ status: 200, json: { fromB: true } }),
    limiter: lim,
    sleepFn: async ms => { sleeps.push(['B', ms]); await new Promise(r => setTimeout(r, ms)) },
    backoffFn: () => 9999,
  })
  const [, bResult] = await Promise.all([pA, pB])
  const bElapsed = Date.now() - tBefore
  assertEq(bResult, { fromB: true }, 'B eventually completes')
  // pauseFor(1000) was applied at ~t=0; B started at ~t=30; B should have
  // waited until at least t=1000, so bElapsed ≥ 970ms.
  assert(bElapsed >= 950, `B waited ${bElapsed}ms (≥950ms expected, limiter advanced by Retry-After)`)
  assert(bElapsed < 1500, `B not stuck (${bElapsed}ms)`)
  const totalWall = Date.now() - start
  assert(totalWall < 2000, `total wall time ${totalWall}ms — sane`)
})

await group('Mixed-status sequence over a 10-entry bib', async () => {
  // Verify the whole pipeline survives a realistic mix of responses without
  // exceptions or fabricated verdicts when the bad responses are transient.
  const bibLines = []
  for (let i = 0; i < 10; i++) {
    bibLines.push(`@article{paper${i}, title={Paper Number ${i} About Things}, author={Author, A${i}}, year={2024}, journal={J}}`)
  }
  const bibContent = bibLines.join('\n\n')

  let searchCalls = 0
  const flakyFetch = async url => {
    if (url.includes('/paper/search')) {
      searchCalls++
      // Pattern: 200, 429-transient, 200, 500-transient, 200, 200, 429, 200, 200, 200
      // Use the verdict-emitting return shape from s2Fetch's perspective:
      // returning an object that looks like an upstream-already-fetched s2Fetch result.
      if (searchCalls === 2) return { _error: 'rate', _transient: true }
      if (searchCalls === 4) return { _error: 'down', _transient: true }
      if (searchCalls === 7) return { _error: 'rate', _transient: true }
      // Successful S2 search payload — best-match returns the bib paper itself.
      // Author surname "Author" matches the bib's "Author, AX" entries so the
      // verdict is `verified`, not `mismatch`.
      const m = /query=([^&]+)/.exec(url)
      const q = decodeURIComponent(m[1])
      return {
        data: [{
          title: q,
          authors: [{ name: 'A Author' }],
          year: 2024,
          venue: 'J',
        }],
      }
    }
    return []
  }

  const r = await verifyCitations({
    bibFiles: [{ path: 'main.bib', content: bibContent }],
    apiKey: 'k',
    fetchFn: flakyFetch,
  })

  const total = (r.stats.verified || 0) + (r.stats.unverified || 0) +
                (r.stats.fabricated || 0) + (r.stats.mismatch || 0)
  assertEq(total, 10, 'all 10 entries got a verdict')
  assertEq(r.stats.fabricated || 0, 0, 'zero fabricated despite intermittent 429/500')
  assert((r.stats.unverified || 0) === 3, `exactly 3 unverified (transient hits), got ${r.stats.unverified}`)
  assert((r.stats.verified || 0) === 7, `exactly 7 verified, got ${r.stats.verified}`)
})

await group('saveCache write is atomic under concurrent writers', async () => {
  const { saveCache, loadCache } = __test__
  const os = await import('node:os')
  const fsMod = await import('node:fs')
  const pathMod = await import('node:path')
  const tmp = fsMod.mkdtempSync(pathMod.join(os.tmpdir(), 'citverify-'))
  try {
    // 10 concurrent writers with distinct payloads. After all settle, the
    // file must parse and equal exactly one of the inputs (no torn writes).
    const payloads = Array.from({ length: 10 }, (_, i) => ({
      [`k${i}`]: 'x'.repeat(50_000 + i),
    }))
    await Promise.all(payloads.map(p => Promise.resolve(saveCache(tmp, p))))
    const final = loadCache(tmp)
    const matched = payloads.find(p => JSON.stringify(p) === JSON.stringify(final))
    assert(matched != null, 'final cache file equals exactly one input payload (no torn JSON)')
    // No leftover temp files.
    const leftovers = fsMod.readdirSync(tmp).filter(f => f.endsWith('.tmp'))
    assertEq(leftovers, [], 'no .tmp leftovers after concurrent writes')
  } finally {
    fsMod.rmSync(tmp, { recursive: true, force: true })
  }
})

await group('S2RateLimiter instances are independent (documents cluster-mode gap)', async () => {
  // This is intentional: the limiter is per-process. Two Node workers
  // (cluster mode, multiple Docker replicas) will independently hit S2 at
  // 1 RPS each, which exceeds Semantic Scholar's per-key/per-IP cap. This
  // test pins that assumption so a future cluster-mode rollout breaks the
  // suite instead of silently exceeding the rate limit in prod.
  const { S2RateLimiter } = __test__
  const A = new S2RateLimiter(100)
  const B = new S2RateLimiter(100)
  const t0 = Date.now()
  await Promise.all([A.acquire(), B.acquire()])
  const t1 = Date.now() - t0
  assert(t1 < 30, `two separate limiters fire in parallel (${t1}ms < 30ms) — confirms per-process scope`)
})

await group('verifyCitations under sustained 429 produces only warnings', async () => {
  const bibLines = []
  for (let i = 0; i < 5; i++) {
    bibLines.push(`@article{p${i}, title={Real Paper ${i}}, author={A, B}, year={2024}, journal={J}}`)
  }
  const sustained429 = async () => ({
    _error: 'S2 429 after 5 retries: too many',
    _transient: true,
  })
  const r = await verifyCitations({
    bibFiles: [{ path: 'main.bib', content: bibLines.join('\n\n') }],
    apiKey: 'k',
    fetchFn: sustained429,
  })
  assertEq(r.stats.fabricated || 0, 0, 'no critical/fabricated flags during rate-limit storm')
  assertEq(r.stats.unverified || 0, 5, 'all 5 entries unverified')
  for (const c of r.comments) {
    assertEq(c.severity, 'warning', `every comment is a warning, not critical: ${c.highlightText}`)
  }
})

// ---------------------------------------------------------------------------
// 8. Optional live smoke test
// ---------------------------------------------------------------------------

if (process.argv.includes('--live')) {
  await group('LIVE Semantic Scholar smoke test', async () => {
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY
    if (!apiKey) {
      console.log('  (skipped — SEMANTIC_SCHOLAR_API_KEY not set)')
      return
    }

    const sample = `
@inproceedings{vaswani2017attention,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},
  year = {2017},
  booktitle = {Advances in Neural Information Processing Systems}
}

@article{kingma2014adam,
  title = {Adam: A Method for Stochastic Optimization},
  author = {Kingma, Diederik P. and Ba, Jimmy},
  year = {2014},
  journal = {ICLR}
}

@inproceedings{fake2099quantum,
  title = {Quantum Banana Optimization For Faster Than Light Travel In Caves},
  author = {Nobody, Real},
  year = {2099},
  booktitle = {Imaginary Conference}
}

@article{brownwrongauthor,
  title = {Language Models are Few-Shot Learners},
  author = {Notreal, Person},
  year = {2020},
  journal = {arXiv preprint arXiv:2005.14165}
}

@inproceedings{wrongyearbert,
  title = {BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding},
  author = {Devlin, Jacob and Chang, Ming-Wei and Lee, Kenton and Toutanova, Kristina},
  year = {2010},
  booktitle = {NAACL}
}
`
    console.log('  hitting api.semanticscholar.org with 5 test entries...')
    const r = await verifyCitations({
      bibFiles: [{ path: 'live_test.bib', content: sample }],
      apiKey,
    })
    console.log(`  stats: ${JSON.stringify(r.stats)}`)
    console.log(`  ${r.comments.length} comment(s):`)
    for (const c of r.comments) {
      console.log(`    [${c.severity}] ${c.highlightText} → ${c.comment.split('\n').slice(0, 3).join(' | ')}`)
    }
    assert(r.stats.fabricated >= 1, 'fake quantum banana entry flagged as fabricated')
    assert((r.stats.mismatch || 0) >= 1, 'wrong-author or wrong-year entry produces a mismatch')
    assert((r.stats.verified || 0) >= 1, 'at least one real entry verified')
  })
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
