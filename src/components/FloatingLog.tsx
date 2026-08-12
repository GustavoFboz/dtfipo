import React, { useState, useEffect, useRef } from "react";
import { X, ChevronDown, ChevronUp, Terminal, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";

interface FloatingLogProps {
  title?: string;
  logs?: string[];
  autoScroll?: boolean;
}

export function FloatingLog({ 
  title = "System Logs", 
  logs = [], 
  autoScroll = true 
}: FloatingLogProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [logs, autoScroll, isMinimized]);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 right-6 z-[60] flex flex-col pointer-events-none"
    >
      <div className="pointer-events-auto w-80 md:w-96 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-2xl transition-all duration-300">
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3 cursor-pointer bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
            >
              {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-slate-400 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setIsVisible(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence>
          {!isMinimized && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <ScrollArea className="h-48 md:h-64 p-4" ref={scrollRef}>
                <div className="space-y-2">
                  {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Terminal className="h-8 w-8 text-slate-200 dark:text-white/5 mb-2" />
                      <p className="text-[12px] text-slate-400 font-light">Aguardando eventos...</p>
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="flex gap-3 text-[12px] font-mono leading-relaxed group">
                        <span className="text-slate-300 dark:text-slate-700 shrink-0 tabular-nums">
                          {(i + 1).toString().padStart(2, '0')}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 break-all">{log}</span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
