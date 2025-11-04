"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "./ui/button";
import { Upload as UploadIcon, Image as ImageIcon, X, HelpCircle } from "lucide-react";

interface ImageUploadProps {
  onImageSelect: (imageData: string) => void;
  currentImage: string | null;
  onError?: (error: string) => void;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  );
}

export function ImageUpload({ onImageSelect, currentImage, onError }: ImageUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Update the selected file when the current image changes
  useEffect(() => {
    if (!currentImage) {
      setSelectedFile(null);
    }
  }, [currentImage]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections) => {
      if (fileRejections?.length > 0) {
        const error = fileRejections[0].errors[0];
        onError?.(error.message);
        return;
      }

      const file = acceptedFiles[0];
      if (!file) return;

      setSelectedFile(file);
      setIsLoading(true);

      // Convert the file to base64
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && event.target.result) {
          const result = event.target.result as string;
          onImageSelect(result);
        }
        setIsLoading(false);
      };
      reader.onerror = () => {
        onError?.("Error reading file. Please try again.");
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    },
    [onImageSelect, onError]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"]
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false
  });

  const handleRemove = () => {
    setSelectedFile(null);
    onImageSelect("");
  };

  return (
    <div className="w-full">
      {!currentImage ? (
        <div
          {...getRootProps()}
          className={`min-h-[180px] sm:min-h-[150px] p-6 sm:p-4 rounded-xl sm:rounded-lg
          ${isDragActive ? "bg-green-50 border-green-400" : "bg-secondary"}
          ${isLoading ? "opacity-50 cursor-wait" : ""}
          transition-all duration-200 ease-in-out hover:bg-secondary/50 active:scale-[0.98]
          border-2 border-dashed border-secondary
          cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4
        `}
        >
          <input {...getInputProps()} />
          <UploadIcon className="w-10 h-10 sm:w-8 sm:h-8 text-primary flex-shrink-0" aria-hidden="true" />
          <div className="text-center sm:text-left">
            <p className="text-sm sm:text-sm font-medium text-foreground flex items-center justify-center sm:justify-start gap-2">
              <span>1. Envie a foto do seu Amigo</span>
              <span
                className="inline-flex items-center cursor-help"
                title="Recomendações: rosto nítido, bem iluminado, de frente ou 3/4; uma pessoa só; sem óculos escuros; fundo simples."
                aria-label="Ajuda"
              >
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tamanho máximo: 10MB
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center p-4 sm:p-4 rounded-xl sm:rounded-lg bg-secondary border border-secondary">
          <div className="flex w-full items-center mb-4">
            <ImageIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary mr-2 sm:mr-3 flex-shrink-0" aria-hidden="true" />
            <div className="flex-grow min-w-0">
              <p className="text-sm font-medium truncate text-foreground">
                {selectedFile?.name || "Current Image"}
              </p>
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile?.size ?? 0)}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemove}
              className="flex-shrink-0 ml-2 min-h-[44px] min-w-[44px]"
            >
              <X className="w-5 h-5" />
              <span className="sr-only">Remove image</span>
            </Button>
          </div>
          <div className="w-full overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImage}
              alt="Selected"
              className="w-full h-auto object-contain max-h-[400px] sm:max-h-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
