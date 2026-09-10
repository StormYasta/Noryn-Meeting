# Noryn Meeting AI — Instalação no servidor

## Objetivo

O backend roda no servidor da Noryn em container Docker e fica exposto apenas em `127.0.0.1`. O aplicativo desktop acessa o serviço por túnel SSH.

A sessão suporta dois usuários:

- **Usuário A / owner**: cria a reunião, envia áudio e controla o encerramento.
- **Usuário B / viewer**: entra pelo código de pareamento, recebe a mesma transcrição, insights e respostas da LLM, mas **não envia áudio**.

Essa decisão evita duplicação, eco, atraso e sobreposição de áudio quando ambos participam da mesma chamada.

## 1. Pré-requisitos

No servidor:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo systemctl enable --now docker
```

Verifique:

```bash
docker --version
docker compose version
```

## 2. Clonar o projeto

```bash
cd /opt
sudo git clone https://github.com/StormYasta/Noryn-Meeting.git noryn-meeting
cd /opt/noryn-meeting
git checkout feat/server-session-pairing
cd server
```

## 3. Configurar ambiente

```bash
cp .env.example .env
nano .env
```

Configuração inicial sugerida:

```env
MEETING_PORT=8765
CORS_ORIGINS=http://localhost:5173
PAIRING_CODE_LENGTH=6
MAX_VIEWERS=1
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:3b
WHISPER_MODEL=small
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
```

## 4. Subir o backend

```bash
docker compose build
docker compose up -d
```

Verifique:

```bash
docker compose ps
docker compose logs -f meeting-ai
```

Healthcheck local no servidor:

```bash
curl http://127.0.0.1:8765/health
```

Resultado esperado:

```json
{
  "status": "ok",
  "service": "noryn-meeting-ai"
}
```

## 5. Túnel SSH

No notebook que executa o Meeting Copilot:

```bash
ssh -N -L 8765:127.0.0.1:8765 usuario@SEU_SERVIDOR
```

Com chave específica:

```bash
ssh -N \
  -i ~/.ssh/noryn_meeting \
  -L 8765:127.0.0.1:8765 \
  usuario@SEU_SERVIDOR
```

Enquanto esse processo estiver aberto, o aplicativo pode acessar:

```text
http://127.0.0.1:8765
ws://127.0.0.1:8765
```

A porta `8765` não precisa ser aberta publicamente no firewall.

## 6. Teste da sessão compartilhada

### Criar reunião como Usuário A

```bash
curl -X POST http://127.0.0.1:8765/meetings \
  -H 'Content-Type: application/json' \
  -d '{"title":"Teste","owner_name":"Usuario A"}'
```

A resposta contém:

- `meetingId`
- `pairingCode`
- `participant.id`

### Entrar como Usuário B

```bash
curl -X POST http://127.0.0.1:8765/meetings/join \
  -H 'Content-Type: application/json' \
  -d '{"pairing_code":"CODIGO","participant_name":"Usuario B"}'
```

O Usuário B recebe um participante com `role: viewer`.

## 7. Regras de áudio

Somente o socket do owner pode enviar frames binários de áudio.

Se o viewer tentar enviar áudio, o servidor responde:

```json
{
  "type": "error",
  "code": "VIEWER_AUDIO_FORBIDDEN"
}
```

O fluxo correto é:

```text
PC A
mic + system audio
      ↓
Meeting Copilot
      ↓
SSH tunnel
      ↓
Meeting AI backend
      ↓
STT + LLM
      ↓
transcrição/insights compartilhados
      ↓
PC A + PC B
```

O PC B não envia áudio. Ele apenas acompanha a mesma sessão e pode usar os comandos do copiloto.

## 8. Ollama

O backend deve conversar com o Ollama do servidor internamente. Não exponha `11434` publicamente.

Teste no host:

```bash
curl http://127.0.0.1:11434/api/tags
```

Se o Ollama estiver rodando no host, o container usa:

```text
http://host.docker.internal:11434
```

## 9. GPU

Antes de instalar faster-whisper/CUDA, verifique o hardware real:

```bash
nvidia-smi
free -h
lscpu
docker ps
```

A configuração de GPU deve ser feita conforme o servidor real. Não habilite passthrough CUDA sem confirmar que o runtime NVIDIA está instalado.

## 10. Segurança

Para o MVP:

- backend escuta apenas em loopback do host;
- acesso externo ocorre apenas por SSH;
- Ollama permanece privado;
- não salvar áudio por padrão;
- código de pareamento é temporário em memória;
- limite inicial de 2 usuários por reunião.

Antes de produção, adicionar autenticação persistente, expiração de sessão, storage durável e rotação/expiração explícita do pairing code.

## 11. Próximas etapas

O serviço atual estabelece o contrato de sessão, pareamento, WebSocket e autorização owner/viewer. Em seguida devem ser ligados ao pipeline existente:

1. VAD;
2. faster-whisper;
3. fila STT;
4. deduplicação de segmentos;
5. rule engine;
6. Ollama;
7. análise incremental;
8. relatório final;
9. persistência durável.

A prioridade de processamento deve permanecer:

```text
captura > transporte > STT > persistência > regras > LLM
```
