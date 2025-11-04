import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// --- Configuração dos Clientes de IA ---
// NOTA: Isso requer variáveis de ambiente em .env.local:
// GEMINI_API_KEY = "sua-chave-api-gemini-aqui"
// GOOGLE_CLOUD_PROJECT = "seu-projeto-gcloud"
// GOOGLE_CLOUD_LOCATION = "us-central1"
// GOOGLE_APPLICATION_CREDENTIALS_JSON = "conteúdo do JSON da service account" (opcional)
// ----------------------------------------------------

// Cliente Gemini (para Análise de Visão)
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// --- Helper para converter Arquivo (File) para base64 ---
async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  const base64EncodedData = Buffer.from(await file.arrayBuffer()).toString('base64');
  return {
    data: base64EncodedData,
    mimeType: file.type,
  };
}


// --- A Rota da API (POST) ---
export async function POST(request: Request) {
  try {
    // 1. Ler os 3 arquivos do FormData (Contrato 6.2)
    const formData = await request.formData();
    const friendImageFile = formData.get('friendImage') as File | null;
    const baseImageFile = formData.get('baseImage') as File | null;
    const maskImageFile = formData.get('maskImage') as File | null;

    if (!friendImageFile || !baseImageFile || !maskImageFile) {
      return NextResponse.json(
        { error: 'Arquivos ausentes. (friendImage, baseImage, maskImage são obrigatórios)' },
        { status: 400 },
      );
    }

    // --- ETAPA DE IA 1: Análise de Visão (Gemini) ---
    // (Descrever a friendImage para criar o prompt de inpainting)

    console.log('Iniciando Etapa 1: Análise de Visão (Gemini)');
    const friendImageBase64 = await fileToBase64(friendImageFile);
    const visionPrompt =
      'Descreva esta pessoa em detalhes objetivos para uma IA de geração de imagem. Foque em: sexo, idade aproximada, etnia, cor e estilo do cabelo, pelos faciais (barba/bigode), óculos e quaisquer características marcantes. Seja conciso e direto. Responda apenas com a descrição.';

    // Tentar diferentes modelos em ordem de preferência
    const modelsToTry = [
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash-002',
      'gemini-1.5-pro-002',
    ];
    
    let textPrompt = '';
    let lastError: Error | null = null;

    console.log('🔍 Iniciando tentativas com modelos Gemini...');
    for (const modelName of modelsToTry) {
      try {
        console.log(`🔄 Tentando modelo: ${modelName}`);
        const visionResponse = await genAI.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { text: visionPrompt },
                {
                  inlineData: {
                    data: friendImageBase64.data,
                    mimeType: friendImageBase64.mimeType,
                  },
                },
              ],
            },
          ],
        });

        const candidates = visionResponse.candidates || [];
        if (candidates.length > 0) {
          const parts = candidates[0].content?.parts || [];
          for (const part of parts) {
            if ('text' in part && part.text) {
              textPrompt = part.text;
              break;
            }
          }
        }

        if (textPrompt && textPrompt.trim() !== '') {
          console.log(`✅ Modelo ${modelName} funcionou com sucesso!`);
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`❌ Modelo ${modelName} falhou: ${lastError.message}`);
        continue;
      }
    }

    if (!textPrompt || textPrompt.trim() === '') {
      return NextResponse.json(
        { error: `Não foi possível analisar a imagem do amigo. Último erro: ${lastError?.message || 'Nenhum modelo disponível'}` },
        { status: 500 },
      );
    }

    // Este é o prompt que será usado para "pintar" o amigo na cena
    const finalInpaintingPrompt = `FOTO: ${textPrompt}, em um cenário com um político, fotorrealista.`;
    console.log('Etapa 1 Concluída. Prompt Gerado:', finalInpaintingPrompt);


    // --- ETAPA DE IA 2: Inpainting Real (Gemini 2.0 Flash com Edição) ---
    // (Usar Gemini 2.0 Flash para fazer edição real na imagem base usando a máscara)
    // Isso preserva a identidade do amigo e a imagem base do político

    console.log('Iniciando Etapa 2: Inpainting Real (Gemini 2.0 Flash)');
    
    // Preparar as imagens em base64
    const baseImageBase64 = await fileToBase64(baseImageFile);
    const maskImageBase64 = await fileToBase64(maskImageFile);
    const friendImageBase64 = await fileToBase64(friendImageFile);

    // Criar prompt de inpainting muito específico para preservar a identidade
    const inpaintingPrompt = `Esta é uma imagem base (primeira imagem) e uma máscara (segunda imagem) que indica onde editar. 
    
Na área branca da máscara, você DEVE colocar a pessoa da imagem de referência (terceira imagem), mantendo EXATAMENTE o mesmo rosto, características faciais, cabelo, cor de pele e expressão.
    
A pessoa da referência deve aparecer IDÊNTICA na área branca da máscara, preservando 100% de sua identidade. Use apenas o rosto e características da pessoa de referência, mantendo o cenário e o político da imagem base intactos.`;

    // Tentar usar Gemini 2.0 Flash para fazer edição/inpainting
    const imageModelsToTry = [
      'gemini-2.0-flash-exp-image-generation',
      'gemini-2.0-flash-exp',
    ];

    let generatedImage: string | null = null;
    let imageError: Error | null = null;

    for (const modelName of imageModelsToTry) {
      try {
        console.log(`🔄 Tentando inpainting com modelo: ${modelName}`);
        
        // Enviar as 3 imagens: base, máscara e referência
        const imageResponse = await genAI.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { text: inpaintingPrompt },
                {
                  inlineData: {
                    data: baseImageBase64.data,
                    mimeType: baseImageBase64.mimeType,
                  },
                },
                {
                  inlineData: {
                    data: maskImageBase64.data,
                    mimeType: maskImageBase64.mimeType,
                  },
                },
                {
                  inlineData: {
                    data: friendImageBase64.data,
                    mimeType: friendImageBase64.mimeType,
                  },
                },
              ],
            },
          ],
          config: {
            temperature: 0.3, // Temperatura mais baixa para maior precisão
            topP: 0.95,
            topK: 40,
            responseModalities: ['Text', 'Image'],
          },
        });

        // Extrair a imagem da resposta
        const candidates = imageResponse.candidates || [];
        if (candidates.length > 0) {
          const parts = candidates[0].content?.parts || [];
          for (const part of parts) {
            if ('inlineData' in part && part.inlineData) {
              generatedImage = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
              break;
            }
          }
        }

        if (generatedImage) {
          console.log(`✅ Inpainting concluído com sucesso usando ${modelName}!`);
          break;
        }
      } catch (error) {
        imageError = error instanceof Error ? error : new Error(String(error));
        console.log(`❌ Modelo ${modelName} falhou: ${imageError.message}`);
        continue;
      }
    }

    if (!generatedImage) {
      return NextResponse.json(
        { error: `Não foi possível fazer inpainting. Erro: ${imageError?.message || 'Nenhum modelo disponível'}` },
        { status: 500 },
      );
    }

    // --- Resposta (Sucesso - Contrato 6.2) ---
    console.log('Etapa 2 Concluída. Enviando imagem gerada.');

    // Converter data URL para buffer
    const base64Data = generatedImage.split(',')[1];
    const imageBytes = Buffer.from(base64Data, 'base64');
    
    // Retorna a imagem PNG pura, conforme Seção 6.2 do PRD
    return new NextResponse(imageBytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
      },
    });

  } catch (error) {
    console.error('Erro grave na API /api/generate:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}
