# Noryn Meeting AI — Guia de instalação e validação do MVP

## Arquitetura do MVP

O aplicativo continua rodando nos computadores da reunião, mas o processamento pesado fica no servidor da Noryn.

```text
PC do Usuário A
mic + áudio do Google Meet
        |
        | PCM16 mono 16 kHz
        v
SSH tunnel -> Noryn Meeting AI (Docker)
              |-- VAD
              |-- faster-whisper
              |-- deduplicação / anti-hallucination
              |-- regras comerciais
              |-- Ollama
              |-- estado compartilhado
              |-- relatório
                       |
                       +----> PC A
                       +----> PC B
```

A sessão aceita inicialmente **2 usuários**:

- **Usuário A / owner**: cria a sessão e é a **única fonte de áudio** enviada ao backend. O áudio já contém o microfone local e o som do Google Meet capturado pelo computador A.
- **Usuário B / viewer**: entra pelo código de pareamento. Participa normalmente da chamada real, mas o Noryn Meeting do PC B **não captura nem envia áudio**. Ele recebe a mesma transcrição, insights, respostas do copiloto e estado final.

Isso é intencional para impedir eco, sobreposição e diferenças de latência entre duas capturas da mesma chamada.

A porta do Meeting AI deve permanecer privada em `127.0.0.1:8765`. Cada computador acessa essa mesma porta por um túnel SSH próprio.

---

## 1. Antes de instalar

No servidor, registre a saída destes comandos. Eles determinam o perfil ideal do Whisper depois:

```bash
nvidia-smi || true
free -h
lscpu
docker --version
docker compose version
docker ps
```

Se a Noryn já usa Docker, **não reinstale Docker**. Apenas confirme que `docker compose` funciona.

Confirme também onde está a LLM atual:

```bash
curl -sS http://127.0.0.1:11434/api/tags | head
```

Se esse comando responder, há um Ollama acessível pelo host na porta padrão. Se não responder, descubra qual container/porta/modelo a IA atual utiliza antes de alterar qualquer serviço existente.

---

## 2. Clonar a implementação do MVP

Enquanto o PR ainda estiver em validação, use a branch da feature:

```bash
cd /opt
git clone https://github.com/StormYasta/Noryn-Meeting.git noryn-meeting
cd /opt/noryn-meeting
git checkout feat/server-session-pairing
cd server
```

Se o diretório já existir:

```bash
cd /opt/noryn-meeting
git fetch origin
git checkout feat/server-session-pairing
git pull --ff-only origin feat/server-session-pairing
cd server
```

---

## 3. Criar configuração

```bash
cp .env.example .env
nano .env
```

Para o primeiro teste, mantenha algo próximo de:

```env
MEETING_PORT=8765
PAIRING_CODE_LENGTH=6
MAX_VIEWERS=1
SESSION_TTL_MINUTES=480
DATA_DIR=/data
SAVE_AUDIO=false

AUDIO_SAMPLE_RATE=16000
WHISPER_MODEL=small
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
WHISPER_LANGUAGE=pt
WHISPER_BEAM_SIZE=1

OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:3b
ANALYSIS_INTERVAL_SECONDS=90
```

Se o servidor for modesto, comece com:

```env
WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

É melhor validar estabilidade com `base` e depois subir a qualidade do que começar pesado demais.

---

## 4. Escolher como o container alcança o Ollama

Existem dois caminhos preparados.

### Opção A — Docker bridge padrão

Use quando `host.docker.internal:11434` for alcançável de dentro dos containers ou quando a IA já estiver publicada no host de forma compatível.

```bash
docker compose build
docker compose up -d
```

O backend continua publicado somente em:

```text
127.0.0.1:8765
```

### Opção B — host networking no Linux

Use esta opção se o Ollama roda diretamente no host e escuta **somente** `127.0.0.1:11434`. Ela evita expor o Ollama só para permitir a comunicação com o container.

```bash
docker compose -f docker-compose.host.yml build
docker compose -f docker-compose.host.yml up -d
```

Nesse modo o serviço Meeting também é iniciado explicitamente em `127.0.0.1:8765`, portanto continua privado e acessível por SSH.

**Não use os dois compose files ao mesmo tempo.** Escolha um deles.

---

## 5. Primeiro boot

Acompanhe os logs:

```bash
docker logs -f noryn-meeting-ai
```

Na primeira inicialização o faster-whisper pode baixar o modelo. Por isso `/health` pode ficar disponível antes de o Whisper mudar de `loading` para `ready`.

Em outro terminal:

```bash
curl -sS http://127.0.0.1:8765/health | python3 -m json.tool
```

O objetivo é chegar a algo equivalente a:

```json
{
  "status": "ok",
  "service": "noryn-meeting-ai",
  "version": "0.3.0",
  "whisper": {
    "status": "ready"
  },
  "llm": {
    "status": "ready"
  }
}
```

`status: ok` significa que a API está viva. Para uma reunião real, procure também `whisper.status = ready`.

O Ollama pode ficar `unavailable` e o MVP ainda manter transcrição + motor de regras; nesse caso as respostas inteligentes caem para o fallback até corrigirmos a conexão com a LLM.

---

## 6. Verificar o Ollama a partir do container

No compose bridge:

```bash
docker compose exec meeting-ai python - <<'PY'
import httpx
r = httpx.get('http://host.docker.internal:11434/api/tags', timeout=5)
print(r.status_code)
print(r.text[:1000])
PY
```

Se o host responde em `127.0.0.1:11434`, mas esse teste falha, derrube o compose bridge e use a opção `docker-compose.host.yml`:

```bash
docker compose down
docker compose -f docker-compose.host.yml up -d --build
```

No modo host, teste:

```bash
docker compose -f docker-compose.host.yml exec meeting-ai python - <<'PY'
import httpx
r = httpx.get('http://127.0.0.1:11434/api/tags', timeout=5)
print(r.status_code)
print(r.text[:1000])
PY
```

Não abra a porta `11434` para a internet para resolver esse problema.

---

## 7. Smoke test automático do backend

Depois que o container estiver saudável:

```bash
docker exec noryn-meeting-ai python /app/smoke_test.py http://127.0.0.1:8765
```

Resultado esperado:

```text
MVP SMOKE TEST: PASS
```

Esse teste verifica sem depender da qualidade do áudio:

- criação do Usuário A;
- código de pareamento;
- entrada do Usuário B;
- WebSocket dos dois usuários;
- broadcast da mesma transcrição aos dois;
- bloqueio explícito de áudio vindo do Usuário B;
- bloqueio de um terceiro usuário.

---

## 8. Criar o túnel SSH nos dois computadores

### PC do Usuário A

```bash
ssh -N -L 8765:127.0.0.1:8765 USUARIO_SSH@IP_DO_SERVIDOR
```

### PC do Usuário B

Execute o mesmo comando no segundo computador:

```bash
ssh -N -L 8765:127.0.0.1:8765 USUARIO_SSH@IP_DO_SERVIDOR
```

Cada PC terá seu próprio `localhost:8765`, mas ambos apontam para **a mesma instância no servidor**.

Se usar uma chave dedicada:

```bash
ssh -N \
  -i ~/.ssh/noryn_meeting \
  -L 8765:127.0.0.1:8765 \
  USUARIO_SSH@IP_DO_SERVIDOR
```

No Windows PowerShell, o comando também funciona com o OpenSSH do Windows. Deixe o terminal do túnel aberto durante a reunião.

Teste em **cada PC**:

```bash
curl http://127.0.0.1:8765/health
```

Não é necessário liberar a porta `8765` no firewall público.

---

## 9. Rodar o aplicativo desktop

Nos dois PCs, com Node.js compatível instalado:

```bash
git clone https://github.com/StormYasta/Noryn-Meeting.git
cd Noryn-Meeting
git checkout feat/server-session-pairing
npm ci
npm run typecheck
npm run dev
```

Na tela inicial, use como servidor:

```text
http://127.0.0.1:8765
```

Clique em **Testar servidor**. Confirme principalmente que Whisper está `ready`.

---

## 10. Fluxo correto dos dois usuários

### Usuário A

1. Inicia o túnel SSH.
2. Abre Noryn Meeting.
3. Informa nome e escolhe **Criar sessão compartilhada**.
4. Copia o código de pareamento exibido.
5. Na tela de preparação, testa **microfone** e **áudio do computador**.
6. Só depois inicia a captura da reunião.
7. É o único computador que envia áudio ao servidor.

### Usuário B

1. Inicia seu próprio túnel SSH.
2. Abre Noryn Meeting.
3. Informa nome e o código recebido do A.
4. Escolhe **Entrar com código**.
5. Vai diretamente para a sessão compartilhada.
6. **Não inicia captura de microfone nem de sistema.**
7. Pode acompanhar transcrição/insights e usar as consultas manuais do copiloto.

O backend também rejeita binariamente qualquer tentativa de o viewer enviar áudio com:

```json
{
  "type": "error",
  "code": "VIEWER_AUDIO_FORBIDDEN"
}
```

---

## 11. Teste de áudio antes do Google Meet

No PC A, abra um vídeo com fala clara no YouTube e faça quatro testes.

### Teste 1 — apenas áudio do sistema

Fique em silêncio e reproduza o vídeo.

Esperado:

- VU de sistema movimenta;
- transcrição chega do servidor;
- texto aparece simultaneamente no A e no B;
- fila do STT não cresce continuamente.

### Teste 2 — apenas microfone

Pause o vídeo e fale.

Esperado: transcrição da sua fala aparece em ambos.

### Teste 3 — microfone + sistema

Reproduza o vídeo e fale ocasionalmente.

Esperado: o pipeline continua estável. O MVP faz uma inferência aproximada de `Eu` vs `Participante` pela dominância do sinal; isso não é diarização perfeita.

### Teste 4 — duração

Deixe rodar pelo menos **20 minutos**.

Consulte:

```bash
curl -sS http://127.0.0.1:8765/metrics | python3 -m json.tool
```

Critério principal: `audioQueueFrames` deve subir e descer, não crescer indefinidamente; `audioFramesDropped` deve permanecer em `0`.

---

## 12. Teste real de dois usuários no Google Meet

Entre em uma chamada com A e B.

Valide:

- somente o PC A mostra captura ativa;
- B aparece como pareado/online;
- fala de A é capturada pelo microfone do A;
- fala de B e dos demais participantes chega pelo áudio de sistema do A;
- A e B veem a mesma sequência de segmentos;
- uma consulta manual feita por A aparece nos dois;
- uma consulta manual feita por B também usa a mesma sessão/contexto e aparece nos dois;
- finalizar pelo A gera e distribui o mesmo relatório;
- B não consegue encerrar a reunião;
- um terceiro pareamento é recusado.

Use fones de ouvido no PC A para reduzir vazamento acústico do áudio remoto de volta ao microfone.

---

## 13. Persistência

Os dados ficam em:

```text
server/data/<meeting-id>/
├── metadata.json
├── transcript.jsonl
├── state.json
└── final-report.md
```

O áudio bruto **não é salvo por padrão**. O fluxo padrão é:

```text
capturar -> transmitir -> processar -> transcrever -> descartar áudio bruto
```

Isso reduz disco e exposição desnecessária de conteúdo sensível.

---

## 14. Prioridade de recursos

A ordem de prioridade implementada é:

```text
captura > transporte > STT > persistência > regras > LLM
```

Há uma fila exclusiva para áudio/STT. A análise automática é adiada quando existe backlog relevante de áudio. Chamadas do Ollama também são serializadas para evitar múltiplas inferências concorrentes.

No `/metrics`, observe:

```text
audioQueueFrames
audioFramesReceived
audioFramesDropped
sttLatencyMs
analysisLatencyMs
```

Se o servidor ficar sobrecarregado, reduza primeiro:

```env
WHISPER_MODEL=base
ANALYSIS_INTERVAL_SECONDS=120
```

Não sacrifique captura/STT para manter análise automática frequente.

---

## 15. GPU

O caminho de validação inicial funciona em CPU e o serviço tenta fallback para `cpu/int8` se o device configurado falhar.

Antes de habilitar GPU dentro do container, confirme:

```bash
nvidia-smi
docker info | grep -i runtime
```

Se o servidor já possui NVIDIA Container Toolkit funcional, valide separadamente o acesso da GPU a partir de Docker antes de descomentar `gpus: all`.

Para o primeiro MVP, **CPU estável é melhor que CUDA parcialmente configurado**. Depois de vermos o hardware real do servidor, podemos escolher imagem CUDA e `compute_type` adequados.

---

## 16. Diagnóstico rápido

### API não responde pelo notebook

No servidor:

```bash
curl http://127.0.0.1:8765/health
```

Se funciona no servidor mas não no notebook, o problema é o túnel SSH.

No notebook, veja se a porta local está livre e reabra:

```bash
ssh -v -N -L 8765:127.0.0.1:8765 USUARIO_SSH@IP_DO_SERVIDOR
```

### Whisper fica `error`

```bash
docker logs --tail 200 noryn-meeting-ai
```

Teste inicialmente `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE_TYPE=int8` e `WHISPER_MODEL=base`.

### LLM fica `unavailable`

Primeiro confirme Ollama no host, depois execute o teste de conectividade do item 6. Se o host usa `127.0.0.1`, prefira `docker-compose.host.yml` em vez de expor Ollama publicamente.

### Transcrição repete frases

O backend possui VAD, `condition_on_previous_text=False`, filtro de no-speech, anti-hallucination e deduplicação de segmentos. Se ainda houver repetição, capture os logs e o trecho de `transcript.jsonl`; não aumente simplesmente o tamanho do modelo antes de descobrir a causa.

### Fila cresce sem parar

```bash
curl http://127.0.0.1:8765/metrics
```

Reduza o modelo Whisper para `base`, aumente o intervalo da LLM e observe CPU/GPU/RAM.

---

## 17. Segurança e privacidade do MVP

- Meeting AI fica em loopback e é acessado por SSH.
- Ollama não deve ficar exposto publicamente.
- Código de pareamento é aleatório e a sessão expira por TTL em memória.
- Limite atual: 1 owner + 1 viewer.
- Somente owner transmite áudio e encerra a reunião.
- Não salvar áudio é o padrão.
- Logs não devem imprimir o conteúdo bruto do áudio.

Para uso real com clientes, obtenha a autorização/consentimento adequado para captura e processamento da reunião conforme a política da empresa e orientação jurídica aplicável.

Antes de transformar o MVP em produto público ainda serão necessários autenticação real de usuários, autorização persistente, TLS sem depender de SSH, storage transacional, políticas de retenção, rate limiting e observabilidade mais completa.

---

## Checklist GO / NO-GO para a reunião

O MVP está pronto para ser usado na reunião somente quando todos estes pontos passarem:

```text
[ ] /health = status ok
[ ] whisper.status = ready
[ ] smoke_test.py = PASS
[ ] túnel SSH funciona no PC A
[ ] túnel SSH funciona no PC B
[ ] PC A cria código e PC B pareia
[ ] PC B não inicia captura de áudio
[ ] YouTube no PC A é transcrito no A e no B
[ ] microfone do A é transcrito no A e no B
[ ] audioFramesDropped permanece 0
[ ] audioQueueFrames não cresce progressivamente por 20 min
[ ] consulta manual do copiloto chega aos dois
[ ] finalização gera final-report.md
```

Se Whisper funcionar mas Ollama não, ainda é possível validar a reunião com transcrição + regras. Se a fila de áudio crescer continuamente ou houver perda de frames, considere **NO-GO** até reduzir o modelo/corrigir a capacidade do servidor.
