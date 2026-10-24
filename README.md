# Vizinhos 3D — simulador de construção de casas multiplayer (2 jogadores)

Jogo 3D no navegador (Chrome, Edge, Firefox) em que duas pessoas são vizinhas: cada uma tem seu terreno, constrói a casa do zero e pode visitar a do outro em tempo real. Não há dinheiro, compras nem desbloqueios: tudo fica liberado.

## O que já funciona (versão 0.1)

| Área | Recursos |
|---|---|
| Multiplayer | Criar mundo, código/link de convite, entrar sem configurar IP/porta, 2 terrenos vizinhos com rua compartilhada, sincronização em tempo real, presença (entrou/saiu), chat, reconexão automática com reenvio das alterações pendentes, visitantes extras sem permissão de construir |
| Permissões | Cada lote tem dono; o servidor valida todas as alterações e recusa construções fora do seu lote; o dono pode liberar o vizinho para ajudar |
| Persistência | Mundo salvo no servidor (arquivos JSON ou PostgreSQL); o status só mostra “Salvo” depois da confirmação do servidor; cópia local automática (IndexedDB) e exportar/restaurar em .json |
| Terreno | 3 tamanhos de lote, 3 relevos iniciais, pincéis para elevar, abaixar, nivelar, suavizar e pintar o solo (grama, terra, areia, pedra…), atalhos para montanhas, colinas, vales e barrancos |
| Construção | Paredes ponto a ponto com medidas, cômodo por arraste (4 paredes + piso), pisos, lajes e fundações, pilares, vigas, escadas que abrem o vão na laje de cima, até 10 pavimentos, encaixe na grade e nas extremidades (G desliga) |
| Portas e janelas | 8 tipos de porta/portão e 7 de janela, recorte automático do vão, abrir/fechar (tecla E) |
| Telhados | Duas águas, uma água, quatro águas, colonial, laje plana, embutido (platibanda), pergolado e cobertura de garagem, com inclinação, beiral e materiais ajustáveis; ocultar telhados (T) |
| Materiais | 32 materiais com texturas procedurais (tijolo, concreto, madeira, mármore, granito, porcelanato, vidro, aço…), cor por paleta/seletor/hex, rugosidade, reflexividade e escala; cada lado da parede é independente; aplicar em vários objetos de uma vez |
| Objetos | 53 móveis, decorações e elementos de jardim em 3D (sofás, camas, cozinha, banheiro, luminárias, árvores, palmeiras, flores, cercas, churrasqueira…), 6 estilos |
| Água | Piscinas retangulares, redondas, ovais e de borda infinita (escavação automática, área rasa, luz subaquática), lagos e espelhos d’água |
| Personagens | Editor com prévia 3D: base corporal, altura, físico, pele, rosto (6 ajustes), cor dos olhos, 14 cabelos, barba, 10 partes de cima, 9 de baixo/vestido, 6 calçados, chapéu, óculos, relógio e bolsa; animações de caminhar, correr, pular e ficar parado |
| Exploração | Câmera livre de construção, 3ª pessoa e 1ª pessoa, colisão com paredes e móveis, passagem por portas, subida de escadas, visita à casa do vizinho |
| Gráficos | Céu físico, sol e hora do dia, luzes noturnas, sombras, reflexos; presets Baixa, Média, Alta e **Ultra (4K)** (resolução nativa até 4K, texturas 1024 px com mapa de normal, sombras 4096, oclusão de ambiente GTAO, bloom); botão **📷 Foto 4K**, que renderiza a vista atual em 3840×2160 PNG |
| Edição | Seleção (Shift soma), mover arrastando, girar, duplicar, excluir, painel de propriedades com medidas, desfazer/refazer (inclusive relevo) |

### Limitações desta versão
- **Realismo:** casas, materiais e iluminação ficam convincentes, mas texturas e modelos são gerados por código. Os personagens são humanos estilizados (proporções e rosto modelados), **não fotorrealistas**. Para chegar perto de fotorrealismo, a próxima etapa é integrar texturas PBR escaneadas (CC0, ex.: Poly Haven/ambientCG) e modelos humanos com esqueleto (ex.: exportados do MakeHuman, CC0).
- **Rios por pontos e curvas** ainda não existem: por enquanto, escave um canal com o pincel e coloque espelhos d’água.
- Elevadores residenciais ainda não existem.
- A foto 4K e o preset Ultra exigem placa de vídeo dedicada. Em notebooks simples, use Média.

## Executar no seu computador

Requisito: [Node.js 18 ou mais novo](https://nodejs.org).

```bash
npm install --omit=dev
npm start
```
Abra http://localhost:3000. Os mundos ficam salvos na pasta `data/`.

### Jogar com um amigo em outro lugar, sem hospedagem (grátis)
1. Rode `npm start` no seu PC.
2. Instale o [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) e rode `cloudflared tunnel --url http://localhost:3000`.
3. Ele mostra um endereço `https://….trycloudflare.com`. Abra esse endereço, crie o mundo e clique em **Convidar**: o link enviado já funciona para o amigo.
- Prós: grátis, sem cadastro, e os dados ficam no seu disco. Contras: o seu PC precisa ficar ligado e o endereço muda a cada execução (os mundos continuam salvos).

## Publicar na internet (Render, plano gratuito)
1. Suba esta pasta para um repositório no GitHub (pode ser pelo upload da página web).
2. No [Render](https://render.com): **New → Blueprint** e escolha o repositório (o `render.yaml` já está pronto). Ou **New → Web Service** com *Build* `npm install --omit=dev` e *Start* `npm start`.
3. **Importante:** o disco do plano gratuito do Render é apagado quando o serviço reinicia ou “dorme” (após cerca de 15 min sem acesso). Para não perder os mundos, use um banco gratuito:
   - Crie um banco PostgreSQL grátis no [Neon](https://neon.tech) (0,5 GB, suficiente para centenas de mundos) e copie a *connection string*.
   - No Render, em **Environment**, adicione `DATABASE_URL` = a string do Neon. A tabela é criada sozinha.
4. Sem `DATABASE_URL`, o jogo funciona, mas depende da cópia local: se o servidor perder o mundo, a tela inicial oferece **Restaurar a partir da cópia local**.

Limites do plano gratuito do Render: o serviço “dorme” sem uso e leva cerca de 30 a 60 s para acordar no primeiro acesso; há limite mensal de horas e de banda (suficiente para uso pessoal).

## Como conectar dois jogadores
1. Jogador 1: **Criar mundo** → personaliza o personagem → **Criar e entrar**. Fica com o Terreno 1 (à esquerda de quem olha da rua).
2. Clica em **✉ Convidar** e envia o link (ou o código de 6 letras).
3. Jogador 2: abre o link → **Entrar** → personaliza → **Entrar no mundo**. Fica com o Terreno 2.
4. Na próxima vez, cada um usa **Continuar jogando** na tela inicial. A identidade fica no navegador, então use sempre o mesmo navegador e computador (ou restaure a cópia em .json).

## Salvamento e recuperação
- Automático: cada alteração vai para o servidor, que valida e grava. O indicador mostra **Salvando… → ✓ Salvo**.
- Sem conexão, as alterações ficam pendentes e são reenviadas na reconexão; o servidor ignora duplicadas.
- **💾 Salvamento → Baixar cópia de segurança** gera um `.json`. Para restaurar: tela inicial → **Restaurar de cópia (.json)** (só funciona se o código não existir mais no servidor).

## Controles
- **Construir:** botão esquerdo usa a ferramenta · botão direito gira a câmera · roda aproxima · W A S D movem a câmera
- **Paredes:** clique em cada canto; duplo clique ou Esc termina · Cômodo, piso, telhado e piscina: arrastar
- **Seleção:** clique · Shift+clique · arrastar move · R gira · Ctrl+D duplica · Delete exclui · Ctrl+Z/Ctrl+Y
- **Explorar:** Tab alterna · V muda entre 1ª e 3ª pessoa · W A S D · Shift corre · Espaço pula · E abre portas · Enter abre o chat

## Como foi testado
Testes automatizados com dois navegadores Chromium independentes (renderização por software) no mesmo servidor:
criar mundo e convite, entrada do segundo jogador, presença, cômodo e parede pelo mouse, porta, janela, escada, laje, 2º pavimento, telhado, palmeira, sofá, piscina, pincel de relevo, sincronização (19 objetos idênticos nos dois lados), recusa pelo servidor de construção no lote alheio, aparência e chat em tempo real, persistência após reiniciar o servidor, colisão (parede bloqueia, porta deixa passar, escada sobe ao 2º pavimento), preset Ultra e captura em alta resolução. O adaptador PostgreSQL foi testado com um banco local.
**Não foi testado:** dois computadores físicos em redes diferentes, placas de vídeo reais (o desempenho real é muito maior que o da renderização por software usada no teste) e a publicação no Render/Neon.

Teste reproduzível em dois computadores: publique (Render ou túnel Cloudflare), abra o link em um PC, crie o mundo, envie o convite ao outro PC, construa uma parede e confirme que ela aparece no outro lado sem recarregar. Feche os dois navegadores, reabra por **Continuar jogando** e confira se tudo continua lá.

## Estrutura do código
```
server/index.js     servidor HTTP + WebSocket (salas, validação, presença, chat, salvamento)
server/storage.js   persistência: arquivos JSON ou PostgreSQL (DATABASE_URL)
shared/catalog.js   catálogos: materiais, portas/janelas, telhados, móveis, opções de avatar
shared/world.js     geração do bairro, terreno, esquema/validação dos objetos e operações (usado pelo cliente e pelo servidor)
public/js/
  main.js           tela inicial, conexão, laço principal, cópias locais, foto 4K
  net.js            cliente WebSocket com reconexão e reenvio idempotente
  game.js           estado, aplicação de operações, malhas, seleção, desfazer/refazer, jogadores remotos
  scene.js          renderizador, céu, luz, presets gráficos, pós-processamento, bairro fixo
  terrain.js        malha do terreno (heightfield) e recortes de piscina
  builders.js       paredes com vãos, aberturas, pisos, telhados, escadas, pilares, vigas, piscinas, lagos
  items3d.js        móveis, decoração e vegetação 3D
  materials.js      texturas procedurais, mapas de normal e água
  avatar.js         personagem humano, roupas, cabelos e animações
  editor.js         editor de personagem
  physics.js        chão, escadas, colisões
  player.js         movimento e câmeras
  tools.js          ferramentas de construção
  ui.js             interface
```
Para adicionar um móvel: inclua a chave em `ITEMS` (`shared/catalog.js`) e o modelo em `buildItem` (`items3d.js`). Para um material: `MATERIALS` mais o gerador de textura em `materials.js`.

Three.js r169 (MIT) está incluído em `public/vendor`; o jogo não depende de CDN.
