import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { z } from 'zod/v3'
import {
    addDuvida, getDuvidas, getProgresso, listModules,
    markAulaConcluida, readNote, searchNotes,
} from "./service.ts";

export const server = new McpServer({
    name: 'pos-estudos-mcp',
    version: '0.0.1'
})

function errorResult(action: string, error: unknown) {
    return {
        isError: true,
        content: [{
            type: 'text' as const,
            text: `Falha ao ${action}. Detalhes: ${error instanceof Error ? error.message : String(error)}`
        }]
    }
}

server.registerTool(
    'listar_modulos',
    {
        description: 'Lista os módulos (pastas) disponíveis na pasta de anotações da pós',
        outputSchema: {
            modulos: z.array(z.string()).describe("Nomes das pastas de módulos")
        }
    },
    async () => {
        try {
            const modulos = await listModules()
            return {
                content: [{ type: 'text', text: modulos.join('\n') || 'Nenhum módulo encontrado' }],
                structuredContent: { modulos }
            }
        } catch (error) {
            return errorResult('listar os módulos', error)
        }
    }
)

server.registerTool(
    'buscar_anotacao',
    {
        description: 'Busca um termo nas anotações da pós (.md e .txt) e retorna arquivo, linha e trecho. Use antes de responder dúvidas sobre o conteúdo estudado.',
        inputSchema: {
            termo: z.string().min(2).describe("Texto a procurar (sem diferenciar maiúsculas/minúsculas)"),
            modulo: z.string().optional().describe("Pasta do módulo para restringir a busca, como retornado por listar_modulos")
        },
        outputSchema: {
            resultados: z.array(z.object({
                arquivo: z.string(),
                linha: z.number(),
                trecho: z.string(),
            })).describe("Até 20 ocorrências encontradas")
        }
    },
    async ({ termo, modulo }) => {
        try {
            const resultados = await searchNotes(termo, modulo)
            const text = resultados.length
                ? resultados.map(r => `${r.arquivo}:${r.linha} — ${r.trecho}`).join('\n')
                : `Nada encontrado para "${termo}"`
            return {
                content: [{ type: 'text', text }],
                structuredContent: { resultados }
            }
        } catch (error) {
            return errorResult('buscar nas anotações', error)
        }
    }
)

server.registerTool(
    'ler_anotacao',
    {
        description: 'Lê o conteúdo completo de um arquivo de anotação',
        inputSchema: {
            arquivo: z.string().describe("Caminho relativo à pasta de anotações, como retornado por buscar_anotacao")
        }
    },
    async ({ arquivo }) => {
        try {
            return { content: [{ type: 'text', text: await readNote(arquivo) }] }
        } catch (error) {
            return errorResult(`ler o arquivo ${arquivo}`, error)
        }
    }
)

server.registerTool(
    'registrar_duvida',
    {
        description: 'Registra uma dúvida de estudo para revisar depois',
        inputSchema: {
            modulo: z.string().describe("Módulo relacionado à dúvida"),
            texto: z.string().min(3).describe("A dúvida em si")
        }
    },
    async ({ modulo, texto }) => {
        try {
            const duvida = await addDuvida(modulo, texto)
            return { content: [{ type: 'text', text: `Dúvida registrada em ${modulo}: ${duvida.texto}` }] }
        } catch (error) {
            return errorResult('registrar a dúvida', error)
        }
    }
)

server.registerTool(
    'marcar_aula_concluida',
    {
        description: 'Marca uma aula como concluída no progresso de estudos',
        inputSchema: {
            modulo: z.string().describe("Módulo da aula"),
            aula: z.string().describe("Nome ou número da aula")
        }
    },
    async ({ modulo, aula }) => {
        try {
            const progresso = await markAulaConcluida(modulo, aula)
            return { content: [{ type: 'text', text: `Aula "${aula}" concluída. ${modulo}: ${progresso[modulo].length} aula(s) feitas.` }] }
        } catch (error) {
            return errorResult('marcar a aula', error)
        }
    }
)

server.registerResource(
    'pos://progresso',
    'pos://progresso',
    {
        description: 'Aulas concluídas por módulo',
        mimeType: 'application/json',
    },
    async () => ({
        contents: [{
            uri: 'pos://progresso',
            mimeType: 'application/json',
            text: JSON.stringify(await getProgresso(), null, 2),
        }]
    })
)

server.registerResource(
    'pos://duvidas',
    'pos://duvidas',
    {
        description: 'Dúvidas de estudo registradas',
        mimeType: 'application/json',
    },
    async () => ({
        contents: [{
            uri: 'pos://duvidas',
            mimeType: 'application/json',
            text: JSON.stringify(await getDuvidas(), null, 2),
        }]
    })
)

server.registerPrompt(
    'gerar_quiz',
    {
        description: 'Gera um quiz sobre um módulo com base nas suas anotações',
        argsSchema: {
            modulo: z.string().describe("Módulo do quiz"),
            quantidade: z.string().optional().describe("Número de perguntas (padrão 5)")
        }
    },
    ({ modulo, quantidade }) => ({
        messages: [{
            role: 'user',
            content: {
                type: 'text',
                text: `Use as tools buscar_anotacao e ler_anotacao para ler minhas anotações do módulo "${modulo}". Depois crie um quiz com ${quantidade ?? '5'} perguntas de múltipla escolha baseadas nelas. Mostre as respostas só no final.`,
            }
        }]
    })
)

server.registerPrompt(
    'plano_de_revisao',
    {
        description: 'Monta um plano de revisão com base nas dúvidas e no progresso',
    },
    () => ({
        messages: [{
            role: 'user',
            content: {
                type: 'text',
                text: 'Leia os resources pos://duvidas e pos://progresso e monte um plano de revisão para esta semana, priorizando as dúvidas não resolvidas. Use buscar_anotacao para indicar onde revisar cada assunto.',
            }
        }]
    })
)
