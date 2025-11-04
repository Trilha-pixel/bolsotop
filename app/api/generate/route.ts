import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';

// --- Configuração dos Clientes de IA ---
// NOTA: Isso requer variáveis de ambiente em .env.local ou Vercel:
// GEMINI_API_KEY = "sua-chave-api-gemini-aqui"
// VERTEX_AI_API_KEY = "sua-chave-api-vertex-ai-aqui" (nova - preferencial)
// GOOGLE_CLOUD_PROJECT = "seu-projeto-gcloud" (fallback se não usar API Key)
// GOOGLE_CLOUD_LOCATION = "us-central1" (fallback se não usar API Key)
// GOOGLE_APPLICATION_CREDENTIALS_JSON = "conteúdo do JSON da service account" (fallback)
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

// --- Helper para redimensionar imagem para garantir dimensões compatíveis ---
async function resizeImageToMatch(
  imageBase64: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  // Importar dinamicamente sharp
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp');
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const resized = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'fill',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .toBuffer();
    return resized.toString('base64');
  } catch {
    // Se sharp não estiver disponível, retornar original
    console.warn('⚠️ Sharp não disponível, usando imagem original. Instale: npm install sharp');
    return imageBase64;
  }
}

// --- Helper para obter dimensões de uma imagem ---
async function getImageDimensions(imageBase64: string): Promise<{ width: number; height: number }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp');
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const metadata = await sharp(imageBuffer).metadata();
    return {
      width: metadata.width || 1024,
      height: metadata.height || 1024,
    };
  } catch {
    // Se sharp não estiver disponível, retornar dimensões padrão
    console.warn('⚠️ Não foi possível obter dimensões, usando padrão 1024x1024');
    return { width: 1024, height: 1024 };
  }
}

// --- Helper para obter token de acesso do Google Cloud ---
async function getAccessToken(): Promise<string> {
  let auth: GoogleAuth;
  
  // Se temos credenciais JSON (Service Account da Vercel), usar elas
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
      const jsonString = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      console.log('🔑 Tentando parsear GOOGLE_APPLICATION_CREDENTIALS_JSON (primeiros 100 chars):', jsonString.substring(0, 100));
      const credentials = JSON.parse(jsonString);
      auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      console.log('✅ Credenciais parseadas com sucesso');
    } catch (error) {
      console.error('❌ Erro ao parsear JSON:', error);
      throw new Error(`Erro ao parsear GOOGLE_APPLICATION_CREDENTIALS_JSON: ${error instanceof Error ? error.message : String(error)}. Verifique se o JSON está correto no .env.local`);
    }
  } else {
    // Tentar usar Application Default Credentials (para desenvolvimento local)
    auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  
  if (!accessToken.token) {
    throw new Error('Não foi possível obter token de acesso. Verifique se GOOGLE_APPLICATION_CREDENTIALS_JSON está configurado corretamente na Vercel.');
  }
  
  return accessToken.token;
}

// --- Tipos para resposta do Imagen ---
interface ImagenPrediction {
  bytesBase64Encoded?: string;
  imageBytes?: string;
  generatedImage?: {
    bytesBase64Encoded?: string;
    imageBytes?: string;
  };
}

interface ImagenResponse {
  predictions?: ImagenPrediction[];
}

// --- Helper para processar resposta do Imagen ---
async function processImagenResponse(imagenData: unknown): Promise<NextResponse> {
  console.log('📦 Processando resposta do Vertex AI Imagen');
  
  // Log completo da resposta (limitado a 2000 chars para não sobrecarregar)
  const responseStr = JSON.stringify(imagenData, null, 2);
  console.log('📋 Estrutura completa da resposta (primeiros 2000 chars):', responseStr.substring(0, 2000));
  
  // A resposta pode ter diferentes estruturas, tentar todas
  const response = imagenData as Record<string, unknown>;
  
  // Tentar diferentes caminhos na resposta
  let predictions: ImagenPrediction[] = [];
  
  // Caminho 1: predictions no topo
  if (Array.isArray(response.predictions)) {
    predictions = response.predictions as ImagenPrediction[];
    console.log('✅ Encontrado: predictions no topo');
  }
  // Caminho 2: predictions dentro de data
  else if (response.data) {
    const data = response.data as Record<string, unknown>;
    if (Array.isArray(data.predictions)) {
      predictions = data.predictions as ImagenPrediction[];
      console.log('✅ Encontrado: predictions dentro de data');
    } else if (Array.isArray(data)) {
      predictions = data as ImagenPrediction[];
      console.log('✅ Encontrado: data é um array direto');
    }
  }
  // Caminho 3: resposta direta é um array (mas precisa ter conteúdo)
  else if (Array.isArray(response) && response.length > 0) {
    predictions = response as ImagenPrediction[];
    console.log('✅ Encontrado: resposta é um array direto');
  }
  // Caminho 3b: resposta é um array vazio (problema)
  else if (Array.isArray(response) && response.length === 0) {
    console.error('❌ Resposta é um array vazio!');
    throw new Error('A resposta do Imagen é um array vazio. Isso pode indicar que o modelo não gerou nenhuma imagem ou houve um erro no processamento.');
  }
  // Caminho 4: imagem direta na resposta (sem array)
  else if (response.bytesBase64Encoded || response.imageBytes || response.image) {
    predictions = [response as ImagenPrediction];
    console.log('✅ Encontrado: imagem direta na resposta');
  }
  // Caminho 5: verificar se há algum campo que contenha a imagem
  else {
    // Tentar encontrar qualquer campo que possa conter a imagem
    for (const [key, value] of Object.entries(response)) {
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (obj.bytesBase64Encoded || obj.imageBytes || obj.image || (Array.isArray(value) && value.length > 0)) {
          if (Array.isArray(value)) {
            predictions = value as ImagenPrediction[];
          } else {
            predictions = [obj as ImagenPrediction];
          }
          console.log(`✅ Encontrado: imagem no campo "${key}"`);
          break;
        }
      }
    }
  }
  
  if (predictions.length === 0) {
    console.error('❌ Estrutura da resposta não reconhecida');
    console.error('📋 Chaves disponíveis:', Object.keys(response));
    console.error('📋 Resposta completa:', responseStr.substring(0, 1000));
    throw new Error(`A resposta do Imagen não contém predictions. Estrutura recebida: ${JSON.stringify(Object.keys(response))}. Resposta completa (primeiros 500 chars): ${responseStr.substring(0, 500)}`);
  }

  // A estrutura pode variar, tentar diferentes formatos
  let imageBase64: string | undefined;
  const firstPrediction = predictions[0] as Record<string, unknown>;
  
  if (typeof firstPrediction.bytesBase64Encoded === 'string') {
    imageBase64 = firstPrediction.bytesBase64Encoded;
  } else if (typeof firstPrediction.imageBytes === 'string') {
    imageBase64 = firstPrediction.imageBytes;
  } else if (firstPrediction.generatedImage) {
    const generatedImage = firstPrediction.generatedImage as Record<string, unknown>;
    imageBase64 = (generatedImage.bytesBase64Encoded || generatedImage.imageBytes) as string | undefined;
  } else if (typeof firstPrediction.image === 'string') {
    imageBase64 = firstPrediction.image;
  }

  if (!imageBase64) {
    console.error('❌ Estrutura da prediction não reconhecida:', JSON.stringify(firstPrediction, null, 2));
    throw new Error(`A resposta do Imagen não contém uma imagem gerada no formato esperado. Chaves disponíveis: ${JSON.stringify(Object.keys(firstPrediction))}`);
  }

  const imageBytes = Buffer.from(imageBase64, 'base64');
  console.log('✅ Inpainting concluído com sucesso!');

  return new NextResponse(imageBytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
    },
  });
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
      'gemini-1.5-flash',
      'gemini-1.5-pro',
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


    // --- ETAPA DE IA 2: Inpainting Real (Vertex AI Imagen via REST API) ---
    // (Usar Vertex AI Imagen para fazer inpainting real com máscara, preservando identidade)

    console.log('Iniciando Etapa 2: Inpainting Real (Vertex AI Imagen)');
    
    // Preparar as imagens em base64 (friendImageBase64 já foi criado na Etapa 1)
    const baseImageBase64 = await fileToBase64(baseImageFile);
    let maskImageBase64 = await fileToBase64(maskImageFile);

    // Obter dimensões da imagem base e redimensionar a máscara para corresponder
    try {
      const baseDimensions = await getImageDimensions(baseImageBase64.data);
      console.log(`📐 Dimensões da imagem base: ${baseDimensions.width}x${baseDimensions.height}`);
      
      const maskDimensions = await getImageDimensions(maskImageBase64.data);
      console.log(`📐 Dimensões da máscara: ${maskDimensions.width}x${maskDimensions.height}`);
      
      // Se as dimensões não corresponderem, redimensionar a máscara
      if (maskDimensions.width !== baseDimensions.width || maskDimensions.height !== baseDimensions.height) {
        console.log(`🔄 Redimensionando máscara de ${maskDimensions.width}x${maskDimensions.height} para ${baseDimensions.width}x${baseDimensions.height}`);
        const resizedMaskData = await resizeImageToMatch(
          maskImageBase64.data,
          baseDimensions.width,
          baseDimensions.height
        );
        maskImageBase64 = {
          ...maskImageBase64,
          data: resizedMaskData,
        };
      }
    } catch (error) {
      console.warn('⚠️ Não foi possível verificar/redimensionar imagens:', error);
      // Continuar mesmo assim - o Vertex AI pode lidar com isso ou retornar erro mais claro
    }

    // Criar prompt de inpainting que preserva a identidade
    // IMPORTANTE: Usar a descrição detalhada gerada pelo Gemini para garantir precisão
    const inpaintingPrompt = `INSTRUÇÕES DE INPAINTING:
    
1. Na área BRANCA da máscara, você DEVE colocar uma pessoa com estas características EXATAS:
${textPrompt}

2. A pessoa descrita acima deve aparecer EXATAMENTE como na foto de referência (friendImage), mantendo:
   - O mesmo rosto, formato facial, cor de pele
   - O mesmo cabelo (cor, estilo, comprimento)
   - Os mesmos pelos faciais (barba, bigode se houver)
   - Os mesmos óculos (se houver)
   - A mesma expressão facial e idade

3. A imagem base já contém um político. MANTENHA o político INTACTO e apenas substitua a área branca da máscara.

4. O resultado final deve mostrar a pessoa descrita acima ao lado do político, de forma natural, fotorrealista e profissional, como uma foto de evento político real.`;

    try {
      // Tentar primeiro com API Key (mais simples)
      const vertexAIApiKey = process.env.VERTEX_AI_API_KEY;
      
      if (vertexAIApiKey) {
        console.log('🔑 Usando Vertex AI API Key...');
        
        // Tentar diferentes endpoints para Imagen com API Key
        // NOTA: Imagen 3 usa modelo diferente e estrutura diferente
        const imagenEndpoints = [
          'https://aiplatform.googleapis.com/v1/publishers/google/models/imagen-3.0-capability-001:predict', // Imagen 3 mais recente
          'https://aiplatform.googleapis.com/v1/publishers/google/models/imagegeneration@006:predict', // Fallback
          'https://aiplatform.googleapis.com/v1/publishers/google/models/imagegeneration@005:predict',
        ];


        for (const endpoint of imagenEndpoints) {
          try {
            const fullEndpoint = `${endpoint}?key=${vertexAIApiKey}`;
            console.log(`📡 Tentando endpoint: ${endpoint}`);

            // Verificar se é Imagen 3 (estrutura diferente)
            const isImagen3 = endpoint.includes('imagen-3.0');
            
            let requestBody: Record<string, unknown>;
            
            if (isImagen3) {
              // Imagen 3 usa editConfig com editMode
              requestBody = {
                instances: [
                  {
                    prompt: inpaintingPrompt,
                    image: {
                      bytesBase64Encoded: baseImageBase64.data,
                    },
                    mask: {
                      image: {
                        bytesBase64Encoded: maskImageBase64.data,
                      },
                    },
                    // Imagen 3 pode não suportar referenceImage diretamente
                    // Vamos incluir no prompt de forma mais explícita
                  },
                ],
                parameters: {
                  sampleCount: 1,
                  editConfig: {
                    editMode: 'inpainting-insert', // ou 'inpainting-remove' dependendo da necessidade
                  },
                  guidanceScale: 12,
                },
              };
            } else {
              // Versões antigas do Imagen
              requestBody = {
                instances: [
                  {
                    prompt: inpaintingPrompt,
                    image: {
                      bytesBase64Encoded: baseImageBase64.data,
                    },
                    mask: {
                      image: {
                        bytesBase64Encoded: maskImageBase64.data,
                      },
                    },
                    referenceImage: {
                      bytesBase64Encoded: friendImageBase64.data,
                    },
                  },
                ],
                parameters: {
                  sampleCount: 1,
                  guidanceScale: 12,
                  aspectRatio: '1:1',
                },
              };
            }

            console.log('📤 Enviando requisição para Imagen');
            console.log('📝 Prompt:', inpaintingPrompt.substring(0, 200));
            console.log('🖼️ Tamanho imagem base:', baseImageBase64.data.length, 'chars');
            console.log('🎭 Tamanho máscara:', maskImageBase64.data.length, 'chars');
            console.log('👤 Tamanho referência:', friendImageBase64.data.length, 'chars');

            const imagenResponse = await fetch(fullEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });

            if (!imagenResponse.ok) {
              const errorText = await imagenResponse.text();
              console.error(`❌ Endpoint falhou (${imagenResponse.status}):`, errorText);
              
              if (imagenResponse.status === 403 || imagenResponse.status === 404) {
                continue; // Tentar próximo endpoint
              }
              
              throw new Error(`Vertex AI retornou erro ${imagenResponse.status}: ${errorText}`);
            }

            const responseData = await imagenResponse.json();
            console.log(`✅ Endpoint funcionou com API Key!`);
            console.log('📋 Resposta recebida:', JSON.stringify(responseData, null, 2).substring(0, 500)); // Log parcial para debug
            return await processImagenResponse(responseData);
            
          } catch (error) {
            if (error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'))) {
              continue; // Tentar próximo endpoint
            }
            throw error;
          }
        }

        // Se nenhum endpoint funcionou com API Key, tentar Service Account como fallback
        console.log('⚠️ API Key não funcionou, tentando Service Account como fallback...');
      }

      // Fallback: usar Service Account (código original)
      console.log('🔑 Usando Service Account (fallback)...');
      
      const projectId = process.env.GOOGLE_CLOUD_PROJECT;
      const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
      
      if (!projectId) {
        throw new Error('GOOGLE_CLOUD_PROJECT não configurado. Configure VERTEX_AI_API_KEY ou GOOGLE_CLOUD_PROJECT nas variáveis de ambiente.');
      }

      const accessToken = await getAccessToken();
      console.log('✅ Token obtido com sucesso');

      // Usar Service Account com endpoint baseado em projeto
      // Priorizar Imagen 3 (mais recente e funcional)
      const modelVersions = [
        'imagen-3.0-capability-001', // Imagen 3 mais recente
        'imagegeneration@006', // Fallback
        'imagegeneration@005',
        'imagegeneration@004',
      ];

      let imagenError: Error | null = null;
      let imagenData: ImagenResponse | null = null;

      for (const modelVersion of modelVersions) {
        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelVersion}:predict`;
        
        console.log(`📡 Tentando modelo: ${modelVersion}`);

        // Usar a mesma estrutura para Service Account
        const isImagen3ServiceAccount = modelVersion.includes('imagen-3') || modelVersion.includes('capability');
        
        let requestBody: Record<string, unknown>;
        
        if (isImagen3ServiceAccount) {
          requestBody = {
            instances: [
              {
                prompt: inpaintingPrompt,
                image: {
                  bytesBase64Encoded: baseImageBase64.data,
                },
                mask: {
                  image: {
                    bytesBase64Encoded: maskImageBase64.data,
                  },
                },
              },
            ],
            parameters: {
              sampleCount: 1,
              editConfig: {
                editMode: 'inpainting-insert',
              },
              guidanceScale: 12,
            },
          };
        } else {
          requestBody = {
            instances: [
              {
                prompt: inpaintingPrompt,
                image: {
                  bytesBase64Encoded: baseImageBase64.data,
                },
                mask: {
                  image: {
                    bytesBase64Encoded: maskImageBase64.data,
                  },
                },
                referenceImage: {
                  bytesBase64Encoded: friendImageBase64.data,
                },
              },
            ],
            parameters: {
              sampleCount: 1,
              guidanceScale: 12,
              aspectRatio: '1:1',
            },
          };
        }

        try {
          const imagenResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          if (!imagenResponse.ok) {
            const errorText = await imagenResponse.text();
            console.error(`❌ Modelo ${modelVersion} falhou (${imagenResponse.status}):`, errorText);
            
            if (imagenResponse.status === 403 || imagenResponse.status === 404) {
              imagenError = new Error(`Modelo ${modelVersion}: ${errorText}`);
              continue;
            }
            
            throw new Error(`Vertex AI retornou erro ${imagenResponse.status}: ${errorText}`);
          }

          const responseData = await imagenResponse.json();
          console.log(`✅ Modelo ${modelVersion} funcionou!`);
          console.log('📋 Resposta recebida:', JSON.stringify(responseData, null, 2).substring(0, 500)); // Log parcial para debug
          imagenData = responseData;
          break;
          
        } catch (error) {
          if (error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'))) {
            imagenError = error;
            continue;
          }
          throw error;
        }
      }

      // Se nenhum modelo funcionou
      if (!imagenData) {
        throw new Error(`Nenhum modelo do Vertex AI Imagen está disponível. Último erro: ${imagenError?.message || 'Desconhecido'}. Configure VERTEX_AI_API_KEY ou verifique as permissões da Service Account.`);
      }

      return await processImagenResponse(imagenData);

  } catch (error) {
    console.error('❌ Erro no inpainting:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Stack trace:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json(
      { error: `Erro no inpainting: ${errorMessage}` },
      { status: 500 },
    );
  }

  } catch (error) {
    console.error('❌ Erro grave na API /api/generate:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor.';
    const errorStack = error instanceof Error ? error.stack : 'N/A';
    console.error('❌ Stack trace completo:', errorStack);
    return NextResponse.json(
      { error: `${errorMessage}. Verifique os logs do servidor para mais detalhes.` },
      { status: 500 },
    );
  }
}
