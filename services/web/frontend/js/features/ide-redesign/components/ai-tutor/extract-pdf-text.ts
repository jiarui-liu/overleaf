import * as PDFJS from 'pdfjs-dist'

// Configure worker using workerSrc (string URL) rather than workerPort
// to avoid conflicting with the PDF viewer's global worker setup in pdf-js.ts.
if (!PDFJS.GlobalWorkerOptions.workerSrc) {
  PDFJS.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString()
}

export interface RoleModelPaper {
  name: string
  text: string
}

const MAX_TEXT_LENGTH = 60_000

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await PDFJS.getDocument({
    data: new Uint8Array(arrayBuffer),
    isEvalSupported: false,
  }).promise

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => item.str)
      .join(' ')
    pageTexts.push(pageText)
  }

  await pdf.destroy()

  let fullText = pageTexts.join('\n\n')

  if (fullText.length > MAX_TEXT_LENGTH) {
    fullText =
      fullText.slice(0, MAX_TEXT_LENGTH) +
      '\n\n[... text truncated at ' +
      MAX_TEXT_LENGTH.toLocaleString() +
      ' characters ...]'
  }

  return fullText
}
