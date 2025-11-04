PRD: Gerador de Meme Político
Versão: 1.1 (Revisado para Inpainting)
Autor: (Seu Nome/Empresa)
Status: Rascunho
Última Atualização: 04 de Novembro de 2025
Histórico de Alterações
v1.1 (04/11/2025): Migração da "Abordagem 2 (Geração Pura)" para a "Abordagem 1 (Inpainting de Base)". A geração pura se mostrou incapaz de preservar a identidade do amigo. A Abordagem 1 é mais robusta. O contrato da API (6.2) foi atualizado para refletir essa mudança.

1. Visão Geral e Objetivo
1.1. O Produto
Um SaaS de página única (Single-Page Application) que permite aos usuários gerar imagens fotorrealistas e engraçadas de si mesmos (ou de amigos) interagindo com os políticos Jair Bolsonaro ou Lula.
1.2. O Problema
Usuários buscam formas rápidas e fáceis de criar conteúdo de humor (memes) para entretenimento e compartilhamento em redes sociais. Ferramentas de edição de imagem tradicionais são complexas, e ferramentas de IA genéricas não são focadas nesta tarefa específica.
1.3. A Solução (Atualizada)
Adaptaremos o template gemini-image-editing-nextjs-quickstart para criar uma ferramenta de "um clique". O usuário faz o upload de uma foto de referência (o "amigo") e escolhe um político. O aplicativo usará uma imagem de base pré-preparada do político e aplicará inpainting (preenchimento) para inserir o amigo na cena, garantindo a preservação da identidade de ambos. O resultado é uma imagem pronta para ser baixada e compartilhada.
2. Público-Alvo
Usuários de Redes Sociais: Pessoas ativas no Instagram, WhatsApp, X (Twitter) e TikTok.
Criadores de Conteúdo: Indivíduos que produzem memes e conteúdo viral.
Público Geral: Qualquer pessoa com senso de humor que queira fazer uma "brincadeira" (troll) com um amigo.
3. Histórias de Usuário (User Stories)
ID
Como um...
Eu quero...
Para que...
US-101
Usuário
Fazer o upload de uma foto do meu amigo.
Usar o rosto dele como referência para a geração da imagem.
US-102
Usuário
Escolher entre "Lula" ou "Bolsonaro" com um único clique.
Definir com qual político meu amigo vai aparecer.
US-103
Usuário
Ver uma animação de "carregando" após clicar em "Gerar".
Eu saiba que o sistema está processando meu pedido.
US-104
Usuário
Ver a imagem final gerada (o meme) claramente na tela.
Avaliar o resultado da "zoeira".
US-105
Usuário
Baixar a imagem gerada para o meu celular ou computador.
Poder compartilhar o meme no WhatsApp ou Instagram.

4. Requisitos Funcionais (Adaptação do Template)
4.1. (F-01) Simplificação da Interface (Remoções)
O objetivo é remover toda a complexidade do template original.
REMOVER: O seletor de modo de edição (ex: "Inpainting", "Outpainting", "Background Replace").
REMOVER: A paleta de ferramentas de desenho de máscara (pincel, borracha).
REMOVER: O campo de entrada de prompt de texto (<input type="text"> ou <textarea>). O prompt será 100% controlado pelo backend.
4.2. (F-02) Componente de Upload (Manutenção)
MANTER: A funcionalidade de "arrastar e soltar" (drag-and-drop) ou "clicar para enviar" uma imagem.
Nome: Este componente deve ser renomeado para "1. Envie a foto do seu Amigo".
4.3. (F-03) Componente de Seleção (Adição)
Abaixo do upload, os botões de ação principais serão adicionados.
ADICIONAR: Um grupo de botões com o texto:
[Gerar com Bolsonaro]
[Gerar com Lula]
Estado: Estes botões devem ficar desabilitados (disabled) até que uma imagem seja carregada com sucesso no (F-02).
4.4. (F-04) Feedback de Processamento
MANTER: O estado de "Loading...". Um spinner ou overlay deve cobrir a área de resultado.
Texto: O texto de loading deve ser "Criando sua obra-prima...".
4.5. (F-05) Exibição e Download do Resultado
MANTER: O componente que exibe a imagem final.
ADICIONAR: Um botão proeminente abaixo da imagem de resultado: [Baixar Imagem].
5. Requisitos Não Funcionais
(NFR-01) Responsividade: O design deve ser mobile-first.
(NFR-02) Desempenho (Frontend): O carregamento da página inicial (Next.js) deve ser rápido.
(NFR-03) Simplicidade: O fluxo completo (Upload -> Selecionar -> Ver Resultado) não deve exigir mais que 3 cliques.
6. Plano de Integração (Mock-first)
6.1. Fase 1: Desenvolvimento com Mocks (Frontend)
O fluxo de mock permanece o mesmo para validar o frontend.
Usuário faz upload de amigo.jpg (F-02).
Usuário clica em [Gerar com Bolsonaro] (F-03).
App exibe "Loading" (F-04) por 2 segundos (via setTimeout).
App exibe uma imagem estática local (public/mocks/bolsonaro_result_mock.jpg) (F-05).
Botão de download (F-05) baixa essa imagem mockada.
6.2. Fase 2: Contrato da API (Backend) - ATUALIZADO (Inpainting)
Quando o backend estiver pronto, ele deverá seguir este contrato rigoroso. A API agora recebe 3 arquivos para realizar o inpainting.
Rota: POST /api/generate
Request Body: FormData
friendImage: (File) O objeto do arquivo de imagem do amigo (enviado pelo usuário).
baseImage: (File) A imagem base do político com o "buraco" (ex: bolsonaro_base.png).
maskImage: (File) A imagem da máscara P&B (ex: bolsonaro_mask.png).
Lógica do Backend: O backend usará a friendImage como referência de rosto/pessoa e a usará para preencher a área branca da maskImage por cima da baseImage.
Response (Sucesso 200 OK):
Content-Type: image/png (ou image/jpeg)
Body: Os bytes puros da imagem gerada.
Response (Erro 400/500):
Content-Type: application/json
Body: { "error": "Mensagem de erro descritiva" }
6.3. Fase 2: Conexão (Substituição do Mock) - ATUALIZADO
No frontend, a função handleGenerate que continha o setTimeout será atualizada:
Em vez do setTimeout, ela fará uma chamada fetch('/api/generate') (POST).
Atualização: Ela criará um FormData e adicionará os 3 arquivos:
friendImage: O arquivo do upload (F-02).
baseImage: O arquivo correspondente ao botão clicado (ex: public/base_images/bolsonaro_base.png).
maskImage: O arquivo correspondente ao botão clicado (ex: public/base_images/bolsonaro_mask.png).
Ela tratará a resposta:
Se response.ok, ela pegará a resposta como um blob(), criará um URL.createObjectURL(blob) e o definirá como a imagem de resultado (F-05).
Se !response.ok, ela exibirá uma mensagem de erro ao usuário.
7. Escopo Futuro (Pós-V1)
(V1.1) Adicionar mais políticos (ex: Ciro, Marina, etc.).
(V1.2) Adicionar mais imagens base/cenários para cada político.
(V1.3) Botões de compartilhamento direto (WhatsApp, Twitter).

Fluxogramas
1. Fluxograma da Fase 1 (Desenvolvimento Mock-first)
(Este fluxograma não muda, pois a experiência do usuário no frontend é a mesma)
Snippet de código
graph TD
    subgraph "Fase 1: Fluxo Mock (6.1)"
        M_A[Início: Usuário acessa a página] --> M_B(F-02: Usuário faz upload de 'amigo.jpg');
        M_B --> M_C(F-03: Usuário clica em 'Gerar com Bolsonaro');
        M_C --> M_D[App exibe 'Loading...' por 2s (F-04)];
        M_D --> M_E[App exibe imagem local 'public/mocks/bolsonaro_result_mock.jpg' (F-05)];
        M_E --> M_F(F-05: Usuário clica em 'Baixar Imagem');
        M_F --> M_G[Navegador baixa a imagem mock];
        M_G --> M_H[Fim];
    end

2. Fluxograma da Fase 2 (Fluxo Real com Inpainting) - ATUALIZADO
(Este fluxograma foi atualizado para refletir o novo contrato da API)
Snippet de código
graph TD
    subgraph "Fase 2: Fluxo Real com Backend (6.2 e 6.3)"
        B_A[Início: Usuário acessa a página] --> B_B(F-02: Usuário faz upload da foto do amigo);
        B_B --> B_C(F-03: Usuário clica em 'Gerar com...' [Bolsonaro ou Lula]);
        B_C --> B_D[Frontend exibe 'Loading...' (F-04)];
        B_D --> B_E[Frontend envia POST /api/generate com Amigo + Imagem Base + Máscara (6.2)];
        B_E --> B_F((Backend processa com a LLM (Inpainting) e retorna bytes da imagem));
        B_F --> B_G{API retornou 'response.ok'? (6.3)};
        
        B_G -- Sim --> B_I[Frontend converte bytes (blob) e exibe a imagem gerada (F-05)];
        I --> B_J(F-05: Usuário clica em 'Baixar Imagem');
        B_J --> B_K[Navegador baixa a imagem gerada];
        B_K --> B_L[Fim];
        
        B_G -- Não --> B_H[Frontend exibe mensagem de erro];
        B_H --> B_C;
    end

