# Noryn Meeting Copilot (Local-First Desktop MVP)

O **Noryn Meeting Copilot** é um copiloto de reuniões comerciais para desktop, projetado especificamente para ser executado em tempo real durante reuniões presenciais ou online da Noryn CRM (com template e contexto inicial otimizados para clientes como escritórios de marcas e patentes).

> **REGRA DE OURO DO PROJETO:**
> **LOCAL-FIRST com Custo Operacional ZERO (R$ 0,00 por reunião).**
> Toda a cadeia principal de áudio, transcrição via Whisper local, analista comercial, extração de requisitos, detecção de objeções e persistência roda **100% na máquina local**, sem depender de nuvem ou APIs pagas.

---

## 1. Pré-requisitos

- **Sistema Operacional:** Windows 10/11 (64-bit), macOS ou Linux.
- **Node.js:** Versão 20+ (testado e homologado no Node v24).
- **Gerenciador de Pacotes:** npm (v10+).
- **Opcional (para LLM local expandido):** [Ollama](https://ollama.com/) instalado com o modelo `qwen2.5:1.5b` ou `llama3.2:1b` (o aplicativo já conta com um **Motor Híbrido de Regras Noryn integrado** que roda com zero uso de GPU caso o Ollama não esteja instalado).

---

## 2. Instalação

Abra o terminal na pasta do projeto e instale as dependências:

```bash
npm install
```

O aplicativo já inclui:
- `@xenova/transformers` com ONNX Runtime para rodar o Whisper localmente na CPU ou DirectML/CUDA.
- `sql.js` para persistência local em SQLite sem depender de compiladores C++ externos.

---

## 3. Como Executar em Desenvolvimento

Para iniciar o Vite e a janela desktop do Electron simultaneamente:

```bash
npm run dev
```

Ou se desejar testar a compilação prévia:

```bash
npm run build
npm start
```

---

## 4. Como Gerar o Build Executável (.exe)

Para compilar o pacote desktop para Windows:

```bash
npm run build
npm run dist
```

Os binários compilados serão gerados na pasta `release/`.

---

## 5. Captura de Áudio Dual (Microfone + Google Meet / YouTube)

O aplicativo conta com um **Audio Mixer em tempo real** via Web Audio API, que captura duas fontes simultâneas:
- **Fonte A (Microfone Local):** Captura a sua fala.
- **Fonte B (Áudio do Sistema / Loopback):** Captura a voz dos participantes remotos no Google Meet, Teams, Zoom ou áudio de vídeos do YouTube através do mecanismo nativo de loopback do Windows.

### Como funciona sem mutar os alto-falantes:
- O Electron intercepta a captura via `session.defaultSession.setDisplayMediaRequestHandler` com `audio: 'loopback'`. Isso garante que **você continua ouvindo normalmente a reunião em seus fones ou caixas de som**.
- O buffer de saída do mixer de áudio é zerado para evitar qualquer eco ou realimentação acústica indesejada.

### Na Tela Pré-Reunião (Setup Inicial):
1. **Sua Voz (Microfone):** Selecione o dispositivo de entrada no dropdown. Clique em `[Testar Microfone]` e fale para ver a barra verde de VU meter responder.
2. **Áudio do Computador:** Deixe marcada a opção `[✓] Áudio do Computador (Google Meet / YouTube / Sistema)`. Clique em `[Testar Áudio do PC]` e reproduza um vídeo no YouTube para ver a barra roxa de VU meter responder.
3. Se não houver som tocando no computador por vários segundos, o sistema exibirá um aviso de diagnóstico: *"⚠ Nenhum áudio do computador detectado. Reproduza algum som para testar."*

### Durante a Reunião:
No cabeçalho e na coluna de transcrição, você tem visualização em tempo real de:
- `🎙 MIC [██████░░░░]`
- `🖥 SISTEMA [████████░░]`
- **Identificação Automática de Interlocutores:** O mixer compara os níveis de energia:
  - Quando o sinal do microfone é dominante, a fala é atribuída a **"Eu"** (Gabriel).
  - Quando o áudio do sistema (Google Meet / YouTube) é dominante, a fala é atribuída a **"Cliente"**.
  - Você também pode alternar manualmente a qualquer momento pelos botões `[Eu]` e `[Cliente]`.

---

## 6. Atalhos de Teclado (Hotkeys)

Os atalhos funcionam globalmente e com a janela em foco:

| Atalho | Ação Executada |
|---|---|
| <kbd>CTRL</kbd> + <kbd>SPACE</kbd> | **"O que devo perguntar agora?"** (Exibe imediatamente a principal lacuna e sugestão de pergunta) |
| <kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>O</kbd> | **"Me ajude com essa objeção"** (Analisa os últimos 60-120s e sugere resposta + pergunta de continuidade) |
| <kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>M</kbd> | **"Marcar momento"** (Marca a fala atual na transcrição e nos eventos como ponto crítico) |

---

## 7. Como Trocar o Modelo Local (Whisper e LLM)

### Modelo de Fala (Whisper STT):
Na tela de configurações iniciais ou via `.env`:
- **`Whisper Tiny (Local)`** *(Padrão)*: 75 MB. Baixíssimo consumo de memória, transcrição quase instantânea na CPU, excelente para português.
- **`Whisper Base (Local)`**: 145 MB. Maior precisão para falas rápidas ou ruídos de fundo.

### Modelo de Linguagem (LLM):
O aplicativo oferece suporte a:
1. **Motor Local de Regras Noryn (Built-in):** Ativado por padrão. Latência de 1ms, 0% de uso de GPU, 100% determinístico e infalível.
2. **Ollama Local:** Se você tiver o Ollama rodando (`ollama serve`), o aplicativo detecta automaticamente seus modelos instalados.
   Modelos recomendados para português e hardware comercial:
   ```bash
   ollama run qwen2.5:1.5b
   # ou
   ollama run llama3.2:1b
   ```

---

## 8. Perfis de Hardware e Estratégia de Recursos

O sistema detecta automaticamente sua GPU, VRAM, CPU e memória RAM:

| Perfil | Configuração | Quando Usar |
|---|---|---|
| **Leve** | Whisper Tiny na CPU + Motor de Regras | Laptops leves, placas integradas (Intel UHD), consumo de bateria mínimo. |
| **Balanceado** | Whisper Tiny/Base + Ollama 1.5B (análise a cada 35s) | GPUs com 2GB-4GB VRAM (ex: GeForce MX130) e 12GB+ de RAM. |
| **Qualidade** | Whisper Small + Ollama 7B/8B | GPUs com 6GB+ VRAM (RTX série 30/40). |

---

## 9. Como Reduzir Consumo de VRAM e CPU

- **STT na CPU + LLM Leve:** O Whisper Tiny consome menos de 250MB de RAM na CPU via ONNX Runtime.
- **Inferência Incremental:** O LLM não processa cada frase falada; ele roda apenas a cada 35 segundos ou quando solicitado manualmente através dos botões de ação rápida.
- **Fallback Sem LLM:** Se a sua máquina estiver sob carga pesada, selecione o **Motor de Regras Noryn** no setup. O aplicativo continuará extraindo requisitos, alertando sobre compras de código e calculando a Próxima Melhor Ação com 0% de sobrecarga de GPU.

---

## 10. Como Utilizar 100% Offline (Sem Internet)

1. No primeiro uso, o modelo Whisper (`Xenova/whisper-tiny`) é baixado e armazenado no cache local do computador.
2. Uma vez instalado, **você pode desconectar o cabo de rede ou desligar o Wi-Fi**.
3. O aplicativo continuará gravando, transcrevendo, analisando, salvando as reuniões em SQLite e gerando os relatórios normalmente.

---

## 11. Estrutura dos Dados e Arquivos Salvos

Cada reunião finalizada é salva localmente em:

```
meetings/
  meetings.sqlite                   # Banco SQLite com todas as sessões indexadas
  meeting_{timestamp}/
    metadata.json                   # Detalhes, duração, participantes e hardware
    transcript.json                 # Transcrição completa segmentada com timestamps
    analysis-state.json             # Estado final estruturado (requisitos, objeções, etc.)
    events.json                     # Log de momentos marcados e alertas comerciais
    final-report.md                 # Relatório Executivo Completo com 20 seções
    audio.wav                       # Gravação bruta em áudio (se ativada a opção)
```

### O Relatório Final contém 20 seções obrigatórias:
1. Resumo Executivo
2. Participantes
3. Objetivo da Reunião
4. Necessidades do Cliente
5. Requisitos Funcionais
6. Requisitos Técnicos
7. Integrações
8. Quantidade de Usuários / Filiais / Números
9. Objeções Identificadas (com sugestão de postura e perguntas de continuidade)
10. Decisões Tomadas
11. Promessas Realizadas pela Noryn
12. Pendências e Lacunas a Descobrir
13. Riscos Comerciais e Técnicos
14. Oportunidades Identificadas (Upsell / Customizações)
15. Pontos que Impactam Preço
16. Pontos que Impactam Prazo
17. Modelo Comercial Mais Adequado
18. Próximos Passos
19. Rascunho de Follow-up (pronto para cópia)
20. Transcrição Completa

---

## 12. Arquitetura do Sistema

```
[ Microfone do Usuário ]
          │
          ▼
[ Web Audio API (Renderer) ]
  • Downsampling para 16kHz Float32 mono
  • VU Meter em tempo real
          │
          ▼ IPC Seguro (contextBridge)
[ Electron Main Process ]
  ├── LocalWhisperService (ONNX Runtime) ────► Transcrição Incremental
  │                                                    │
  ├── RuleEngine (Noryn Commercial Rules) ◄───────────┘
  │     • Alertas críticos (compra, código, mensalidade)
  │     • Mapeamento de usuários, filiais, WhatsApp, Calendar
  │     • Cálculo da Próxima Melhor Ação (NBA)
  │
  ├── Local AI Provider (Ollama / Hybrid Engine)
  │     • Análise periódica incremental (35s)
  │     • Consultas manuais do vendedor
  │     • Modo "Me ajude com essa objeção" (últimos 60-120s)
  │
  └── SessionStorage (SQLite + Markdown)
        • meetings.sqlite
        • meetings/{id}/final-report.md
```

---

## 13. Diagnóstico e Resolução de Problemas

- **"O microfone não parece estar captando":**
  Verifique o VU meter ao lado da palavra "Transcrição". Ele deve oscilar em verde quando você fala. Caso contrário, verifique se a permissão de microfone do Windows está habilitada para o aplicativo.
- **"Ollama não aparece na lista de IA":**
  Certifique-se de que o serviço Ollama está rodando no terminal com `ollama serve`. Mesmo sem o Ollama, o aplicativo funciona perfeitamente utilizando o **Motor de Regras Noryn**.
- **"Transcrição com palavras em inglês ou ruído":**
  O Whisper está configurado com `language: 'portuguese'` e filtro automático de ruídos de fundo (`[música]`, `[silêncio]`). Em ambientes com muito eco, aproxime-se do microfone.
