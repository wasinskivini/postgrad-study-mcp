/**
 * PASSO 5.2 — GERADOR DE PDFs PARA OS TESTES
 *
 * Em vez de guardar PDFs no repositório, os testes criam PDFs mínimos na hora.
 * Assim dá para montar exatamente o caso que se quer testar (várias páginas,
 * página sem texto, texto malicioso) e nenhum material de aula é versionado.
 *
 * Um PDF é texto com uma estrutura fixa:
 *   cabeçalho  %PDF-1.4
 *   objetos    catálogo → lista de páginas → cada página → conteúdo da página
 *   xref       tabela com a posição (em bytes) de cada objeto no arquivo
 *   trailer    aponta para o catálogo e para onde começa a xref
 */

// Gera um PDF mínimo e válido: cada item de `pages` é uma página, cada linha vira uma linha de texto.
// Página com lista vazia não tem texto (simula um PDF escaneado).
export function buildPdf(pages: string[][]): Buffer {
    // Em strings de PDF, "\", "(" e ")" precisam de escape.
    const escape = (text: string) => text.replace(/[\\()]/g, char => `\\${char}`)
    const objects: string[] = []
    const pageIds: number[] = []

    // Objeto 1: catálogo (raiz do documento). Objeto 3: a fonte Helvetica.
    // O objeto 2 (lista de páginas) é criado depois, quando os ids das páginas existirem.
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

    // Cada página usa dois objetos: a página em si e o seu conteúdo.
    pages.forEach((lines, index) => {
        const pageId = 4 + index * 2
        const contentId = pageId + 1
        // BT/ET abrem e fecham um bloco de texto; Tf escolhe a fonte; TL é a
        // altura da linha; Td posiciona; Tj escreve; T* pula para a próxima linha.
        const stream = lines.length
            ? `BT /F1 12 Tf 14 TL 72 720 Td ${lines.map(line => `(${escape(line)}) Tj T*`).join(' ')} ET`
            : ''
        pageIds.push(pageId)
        objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
        objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
    })
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

    // Escreve os objetos guardando a posição em bytes de cada um, para a xref.
    let pdf = '%PDF-1.4\n'
    const offsets: number[] = []
    for (let id = 1; id < objects.length; id++) {
        offsets[id] = Buffer.byteLength(pdf, 'latin1')
        pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
    }
    // A xref: cada linha tem exatamente 20 bytes (posição com 10 dígitos).
    const xrefOffset = Buffer.byteLength(pdf, 'latin1')
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
    for (let id = 1; id < objects.length; id++) {
        pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    return Buffer.from(pdf, 'latin1')
}
