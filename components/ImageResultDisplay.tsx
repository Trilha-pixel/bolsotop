"use client";

import { Button } from "@/components/ui/button";
import { Download, RotateCcw, MessageCircle } from "lucide-react";
import { useState } from "react";
import { HistoryItem, HistoryPart } from "@/lib/types";

interface ImageResultDisplayProps {
  imageUrl: string;
  description: string | null;
  onReset: () => void;
  conversationHistory?: HistoryItem[];
}

export function ImageResultDisplay({
  imageUrl,
  description: _unused,
  onReset,
  conversationHistory = [],
}: ImageResultDisplayProps) {
  // description prop is kept for API compatibility but not displayed
  void _unused;
  const [showHistory, setShowHistory] = useState(false);

  const handleDownload = () => {
    // Create a temporary link element
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `gemini-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleHistory = () => {
    setShowHistory(!showHistory);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-2">
        <h2 className="text-lg sm:text-xl font-semibold">Imagem Gerada</h2>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={handleDownload} className="text-xs sm:text-sm min-h-[36px]">
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          {conversationHistory.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleHistory} className="text-xs sm:text-sm min-h-[36px]">
              <MessageCircle className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">{showHistory ? "Ocultar" : "Histórico"}</span>
              <span className="sm:hidden">{showHistory ? "Ocultar" : "Ver"}</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onReset} className="text-xs sm:text-sm min-h-[36px]">
            <RotateCcw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Nova Imagem</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden bg-muted p-2 sm:p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Generated image"
          className="w-full max-w-full sm:max-w-[640px] h-auto mx-auto rounded-lg"
        />
      </div>

      {showHistory && conversationHistory.length > 0 && (
        <div className="p-4 rounded-lg">
          <h3 className="text-sm font-medium mb-4">Conversation History</h3>
          <div className="space-y-4">
            {conversationHistory.map((item, index) => (
              <div key={index} className={`p-3 rounded-lg bg-secondary`}>
                <p
                  className={`text-sm font-medium mb-2 ${
                    item.role === "user" ? "text-foreground" : "text-primary"
                  }`}
                >
                  {item.role === "user" ? "You" : "Gemini"}
                </p>
                <div className="space-y-2">
                  {item.parts.map((part: HistoryPart, partIndex) => (
                    <div key={partIndex}>
                      {part.text && <p className="text-sm">{part.text}</p>}
                      {part.image && (
                        <div className="mt-2 overflow-hidden rounded-md">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={part.image}
                            alt={`Image shared by ${item.role}`}
                            className="max-w-[16rem] h-auto object-contain"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
