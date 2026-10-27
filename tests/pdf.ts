// Gera um PDF mínimo e válido: cada item de `pages` é uma página, cada linha vira uma linha de texto.
// Página com lista vazia não tem texto (simula um PDF escaneado).
export function buildPdf(pages: string[][]): Buffer {
    const escape = (text: string) => text.replace(/[\\()]/g, char => `\\${char}`)
    const objects: string[] = []
    const pageIds: number[] = []

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

    pages.forEach((lines, index) => {
        const pageId = 4 + index * 2
        const contentId = pageId + 1
        const stream = lines.length
            ? `BT /F1 12 Tf 14 TL 72 720 Td ${lines.map(line => `(${escape(line)}) Tj T*`).join(' ')} ET`
            : ''
        pageIds.push(pageId)
        objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
        objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
    })
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

    let pdf = '%PDF-1.4\n'
    const offsets: number[] = []
    for (let id = 1; id < objects.length; id++) {
        offsets[id] = Buffer.byteLength(pdf, 'latin1')
        pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
    }
    const xrefOffset = Buffer.byteLength(pdf, 'latin1')
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
    for (let id = 1; id < objects.length; id++) {
        pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    return Buffer.from(pdf, 'latin1')
}
