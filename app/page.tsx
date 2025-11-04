"use client";
import { useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { ImageResultDisplay } from "@/components/ImageResultDisplay";
import { Button } from "@/components/ui/button";
import { ImageIcon, Wand2 } from "lucide-react";
import { HistoryItem } from "@/lib/types";

const loadingText = "Criando sua obra-prima...";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [resultImage, setResultImage] = useState<string | null>(null);

  const handleImageSelect = (imageData: string, file?: File) => {
    setImage(imageData || null);
    setUploadedImageFile(file || null);
  };

  

  const handleReset = () => {
    // Liberar ObjectURL para evitar vazamento de memória
    if (resultImage && resultImage.startsWith('blob:')) {
      URL.revokeObjectURL(resultImage);
    }
    setImage(null);
    setUploadedImageFile(null);
    setGeneratedImage(null);
    setDescription(null);
    setIsLoading(false);
    setError(null);
    setHistory([]);
    setResultImage(null);
  };

  // If we have a generated image, we want to edit it next time
  const currentImage = generatedImage || image;
  

// Get the latest image to display (prefer mocked/API result image, then generated)
  const displayImage = resultImage || generatedImage;

  const handleGenerate = async (politician: 'bolsonaro' | 'lula') => {
    // 0. (PRD 6.3) Verificar se a imagem do amigo existe
    if (!uploadedImageFile) {
      alert('Por favor, envie a foto do seu amigo primeiro.');
      return;
    }

    // 1. (PRD 4.4) Ativar o loading
    setIsLoading(true);
    setError(null);
    // Liberar ObjectURL anterior para evitar vazamento de memória
    if (resultImage && resultImage.startsWith('blob:')) {
      URL.revokeObjectURL(resultImage);
    }
    setResultImage(null); // Limpar resultado anterior

    try {
      // 2. (PRD 6.3) Preparar o FormData
      const formData = new FormData();
      
      // Adicionar a imagem do amigo
      formData.append('friendImage', uploadedImageFile);

      // 3. (PRD 6.3) Adicionar a Imagem Base e Máscara
      // Carregar as imagens reais do servidor
      const baseImagePath = 
        politician === 'bolsonaro' 
          ? '/base_images/bolsonaro_base.png' 
          : '/base_images/lula_base.png';
          
      const maskImagePath = 
        politician === 'bolsonaro' 
          ? '/base_images/bolsonaro_mask.png' 
          : '/base_images/lula_mask.png';

      // Carregar as imagens como Files
      const [baseImageResponse, maskImageResponse] = await Promise.all([
        fetch(baseImagePath),
        fetch(maskImagePath),
      ]);

      const baseImageBlob = await baseImageResponse.blob();
      const maskImageBlob = await maskImageResponse.blob();

      const baseImageFile = new File([baseImageBlob], baseImagePath.split('/').pop() || 'base.png', { type: 'image/png' });
      const maskImageFile = new File([maskImageBlob], maskImagePath.split('/').pop() || 'mask.png', { type: 'image/png' });

      formData.append('baseImage', baseImageFile);
      formData.append('maskImage', maskImageFile);

      // 4. (PRD 6.3) Fazer a chamada de API
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      // 5. (PRD 6.3) Tratar a resposta
      if (!response.ok) {
        // Tentar ler o JSON de erro
        let errorMessage = `Erro ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Se não conseguir parsear JSON, tentar ler como texto
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch {
            // Se tudo falhar, usar mensagem padrão
          }
        }
        throw new Error(errorMessage);
      }

      // 6. (PRD 6.3) Sucesso: Converter a imagem
      const imageBlob = await response.blob();
      const imageObjectURL = URL.createObjectURL(imageBlob);
      
      // Definir a imagem de resultado (F-05)
      setResultImage(imageObjectURL);

    } catch (error) {
      console.error('Erro ao gerar meme:', error);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      // 7. (PRD 4.4) Desativar o loading
      setIsLoading(false);
    }
  };

  async function handleShare() {
    if (!resultImage) return;
    
    // Verifica se o navegador suporta a API de compartilhamento
    if (navigator.share) {
      try {
        // 1. Converte a blob URL (do estado resultImage) de volta para um File
        const response = await fetch(resultImage);
        const blob = await response.blob();
        const file = new File([blob], "meme-gerado.jpg", { type: blob.type });
        // 2. Chama a API nativa de compartilhamento
        await navigator.share({
          title: "Gabinete da Zoeira",
          text: "Olha a foto que eu fiz de você! 😂",
          files: [file], // Array de arquivos para compartilhar
        });
      } catch (err) {
        // O usuário pode ter cancelado o compartilhamento, ou um erro ocorreu
        console.error("Falha ao compartilhar:", err);
      }
    } else {
      // Fallback para navegadores que não suportam (ex: Desktop Firefox)
      alert("Seu navegador não suporta compartilhamento direto. Por favor, baixe a imagem e compartilhe manualmente.");
    }
  }

  function handleDownload() {
    if (!resultImage) return;
    
    // Como resultImage agora é um ObjectURL (blob), podemos usar diretamente
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = 'meme_gerado.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <main className="min-h-screen relative z-10 py-8 sm:py-12 md:py-16 px-4 sm:px-6 md:px-8">
      {/* Header Principal */}
      <header className="text-center mb-8 sm:mb-12 md:mb-16">
        <h1 className={`font-bebas-neue text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-white font-black drop-shadow-2xl mb-4`} style={{ fontFamily: 'var(--font-bebas-neue), sans-serif', textShadow: '0 4px 12px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6)' }}>
          <Wand2 className="inline-block w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-green-500 mr-3 sm:mr-4 drop-shadow-lg" />
          Gabinete da Zoeira
        </h1>
        <p className="text-xl sm:text-2xl md:text-3xl text-white drop-shadow-xl font-medium" style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.7), 0 1px 2px rgba(0, 0, 0, 0.5)' }}>
          Seu amigo em companhias... questionáveis.
        </p>
      </header>

      {/* Hero Section - Duas Colunas */}
      <section className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 lg:gap-12">
          {/* Coluna da Esquerda - Formulário */}
          <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-xl">
            {error && (
              <div className="p-3 sm:p-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-200 mb-6">
                {error}
              </div>
            )}

            {isLoading ? (
              <div
                role="status"
                className="flex flex-col items-center justify-center min-h-[400px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg animate-pulse p-8"
              >
                <div className="relative">
                  <ImageIcon className="w-16 h-16 text-gray-400 animate-bounce" />
                  <div className="absolute inset-0 bg-white/20 rounded-full animate-ping"></div>
                </div>
                <p className="mt-6 text-lg font-medium text-foreground text-center px-4">
                  {loadingText}
                </p>
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                <ImageUpload
                  onImageSelect={handleImageSelect}
                  currentImage={currentImage}
                />

                <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
                  <Button 
                    variant="default" 
                    disabled={!uploadedImageFile || isLoading} 
                    onClick={() => handleGenerate('bolsonaro')}
                    className="bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-lg sm:text-xl w-full sm:w-auto min-h-[56px] sm:min-h-[56px] transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none"
                  >
                    [Gerar com Bolsonaro]
                  </Button>
                  <Button 
                    variant="secondary" 
                    disabled={!uploadedImageFile || isLoading} 
                    onClick={() => handleGenerate('lula')}
                    className="bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-lg sm:text-xl w-full sm:w-auto min-h-[56px] sm:min-h-[56px] transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none"
                  >
                    [Gerar com Lula]
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Coluna da Direita - A Vitrine/Resultado */}
          <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-xl min-h-[400px] flex flex-col">
            {displayImage ? (
              <div className="flex-1 flex flex-col">
                <ImageResultDisplay
                  imageUrl={displayImage || ""}
                  description={description}
                  onReset={handleReset}
                  conversationHistory={history}
                />
                {resultImage && (
                  <div className="pt-4 flex flex-col sm:flex-row gap-3 mt-auto">
                    <Button 
                      onClick={handleShare}
                      className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-base sm:text-lg w-full sm:w-auto min-h-[48px] sm:min-h-0 flex-1 sm:flex-initial"
                    >
                      Compartilhar no WhatsApp
                    </Button>
                    <Button 
                      onClick={handleDownload}
                      variant="outline"
                      className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-4 sm:py-2 rounded-lg w-full sm:w-auto min-h-[48px] sm:min-h-0 flex-1 sm:flex-initial"
                    >
                      [Baixar Imagem]
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center">
                <div className="space-y-4">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-green-100 to-red-100 rounded-full flex items-center justify-center">
                    <Wand2 className="w-12 h-12 text-gray-400" />
                  </div>
                  <p className="text-lg sm:text-xl font-medium text-gray-600">
                    Seus memes aparecerão aqui!
                  </p>
                  <p className="text-sm text-gray-500">
                    Use o formulário ao lado para gerar sua primeira imagem
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
