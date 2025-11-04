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

    // --- Preparar a imagem do amigo como referência visual ---
    // IMPORTANTE: Não vamos usar Gemini para gerar descrição textual.
    // O Imagen deve usar a imagem de referência visual diretamente.
    
    console.log('Preparando imagens para inpainting...');
    const friendImageBase64 = await fileToBase64(friendImageFile);
    
    // Prompt simples que instrui o Imagen a usar a imagem de referência
    // O Imagen deve usar a contextImage/friendImage como fonte visual, não gerar baseado em texto


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

    // Criar prompt de inpainting simples - o referenceImage deve ser usado automaticamente
    // IMPORTANTE: Prompt mínimo para que o Imagen use a referenceImage visual diretamente
    const inpaintingPrompt = `Coloque a pessoa da imagem de referência na área branca da máscara. Mantenha o político intacto. O resultado deve ser fotorrealista e profissional.`;

    try {
      // Tentar primeiro com API Key (mais simples)
      const vertexAIApiKey = process.env.VERTEX_AI_API_KEY;
      
      if (vertexAIApiKey) {
        console.log('🔑 Usando Vertex AI API Key...');
        
        // Tentar diferentes endpoints para Imagen com API Key
        // NOTA: Usar imagegeneration@006 que já sabemos que funciona com referenceImage
        const imagenEndpoints = [
          'https://aiplatform.googleapis.com/v1/publishers/google/models/imagegeneration@006:predict', // Funciona com referenceImage
          'https://aiplatform.googleapis.com/v1/publishers/google/models/imagegeneration@005:predict',
        ];


        for (const endpoint of imagenEndpoints) {
          try {
            const fullEndpoint = `${endpoint}?key=${vertexAIApiKey}`;
            console.log(`📡 Tentando endpoint: ${endpoint}`);

            // Usar imagegeneration@006 que funciona com referenceImage
            // IMPORTANTE: O prompt deve ser mínimo para que o Imagen priorize a referenceImage visual
            const minimalPrompt = `Coloque a pessoa da imagem de referência na área branca da máscara, mantendo todas as características faciais idênticas.`;
            
            const requestBody = {
              instances: [
                {
                  prompt: minimalPrompt, // Prompt mínimo para não interferir na referência visual
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
                guidanceScale: 15, // Aumentar para forçar mais fidelidade à referência
                aspectRatio: '1:1',
              },
            };

            console.log('📤 Enviando requisição para Imagen');
            console.log('📝 Prompt:', inpaintingPrompt);
            console.log('🖼️ Tamanho imagem base:', baseImageBase64.data.length, 'chars');
            console.log('🎭 Tamanho máscara:', maskImageBase64.data.length, 'chars');
            console.log('👤 Tamanho referência:', friendImageBase64.data.length, 'chars');
            // Log da estrutura do requestBody (sem os dados base64 para não poluir)
            const requestBodyForLog = requestBody as { instances?: Array<Record<string, unknown>>; parameters?: Record<string, unknown> };
            console.log('📋 RequestBody (estrutura):', JSON.stringify({
              instancesCount: requestBodyForLog.instances?.length || 0,
              hasPrompt: !!requestBodyForLog.instances?.[0]?.prompt,
              hasImage: !!requestBodyForLog.instances?.[0]?.image,
              hasMask: !!requestBodyForLog.instances?.[0]?.mask,
              hasReferenceImage: !!requestBodyForLog.instances?.[0]?.referenceImage,
              parameters: requestBodyForLog.parameters,
            }, null, 2));

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
            console.log('📋 Resposta completa recebida:', JSON.stringify(responseData, null, 2));
            console.log('📋 Tipo da resposta:', typeof responseData);
            console.log('📋 Chaves da resposta:', Object.keys(responseData || {}));
            
            // Verificar se a resposta está vazia
            if (!responseData || Object.keys(responseData).length === 0) {
              throw new Error('A resposta do Imagen está vazia. Isso pode indicar que o modelo não gerou nenhuma imagem. Verifique se o prompt e as imagens estão corretos.');
            }
            
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
      // Usar imagegeneration@006 que já sabemos que funciona com referenceImage
      const modelVersions = [
        'imagegeneration@006', // Funciona com referenceImage
        'imagegeneration@005',
        'imagegeneration@004',
      ];

      let imagenError: Error | null = null;
      let imagenData: ImagenResponse | null = null;

      for (const modelVersion of modelVersions) {
        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelVersion}:predict`;
        
        console.log(`📡 Tentando modelo: ${modelVersion}`);

        // Usar imagegeneration@006 que funciona com referenceImage
        // IMPORTANTE: O prompt deve ser mínimo para que o Imagen priorize a referenceImage visual
        const minimalPrompt = `Coloque a pessoa da imagem de referência na área branca da máscara, mantendo todas as características faciais idênticas.`;
        
        const requestBody = {
          instances: [
            {
              prompt: minimalPrompt, // Prompt mínimo para não interferir na referência visual
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
            guidanceScale: 15, // Aumentar para forçar mais fidelidade à referência
            aspectRatio: '1:1',
          },
        };

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
          console.log('📋 Resposta completa recebida:', JSON.stringify(responseData, null, 2));
          console.log('📋 Tipo da resposta:', typeof responseData);
          console.log('📋 Chaves da resposta:', Object.keys(responseData || {}));
          
          // Verificar se a resposta está vazia
          if (!responseData || Object.keys(responseData).length === 0) {
            console.error(`❌ Resposta vazia do modelo ${modelVersion}`);
            imagenError = new Error('A resposta do Imagen está vazia. Isso pode indicar que o modelo não gerou nenhuma imagem.');
            continue; // Tentar próxima versão
          }
          
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
