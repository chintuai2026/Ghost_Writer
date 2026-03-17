import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Copy, Check, Globe, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ghostWriterIcon from './icon.ico';

// ============================================
// Types
// ============================================

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    reasoning?: string;
    sources?: string[];
    isStreaming?: boolean;
    provider?: string;
    model?: string;
}

interface GlobalChatOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    initialQuery?: string;
}

// ============================================
// Typing Indicator Component
// ============================================

const TypingIndicator: React.FC = () => (
    <div className="flex items-center gap-1 py-4">
        <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-text-tertiary"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: "easeInOut"
                    }}
                />
            ))}
        </div>
    </div>
);

// ============================================
// Message Components
// ============================================

const UserMessage: React.FC<{ content: string }> = ({ content }) => (
    <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="flex justify-end mb-6"
    >
        <div className="bg-white text-black px-5 py-3 rounded-2xl rounded-tr-md max-w-[70%] text-[15px] font-medium leading-relaxed shadow-[0_10px_30px_-10px_rgba(255,255,255,0.2)]">
            {content}
        </div>
    </motion.div>
);

const AssistantMessage: React.FC<{
    content: string;
    reasoning?: string;
    sources?: string[];
    isStreaming?: boolean;
    model?: string;
    provider?: string;
    onRefine?: (request: string) => void;
}> = ({ content, reasoning, sources, isStreaming, model, provider, onRefine }) => {
    const [copied, setCopied] = useState(false);
    const [showReasoning, setShowReasoning] = useState(true);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-start mb-8 group"
        >
            {/* Reasoning / Thought Process */}
            <AnimatePresence>
                {reasoning && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-3 w-full max-w-[90%]"
                    >
                        <button
                            onClick={() => setShowReasoning(!showReasoning)}
                            className="flex items-center gap-2 mb-2 text-[10px] font-black uppercase tracking-widest text-text-tertiary/60 hover:text-text-secondary transition-colors"
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-amber-500 animate-pulse' : 'bg-text-tertiary'}`} />
                            {isStreaming ? 'Thinking...' : 'Reasoning Process'}
                        </button>
                        {showReasoning && (
                            <div className="pl-3 border-l-2 border-white/5 text-[13px] text-text-tertiary/80 leading-relaxed font-serif italic whitespace-pre-wrap">
                                {reasoning}
                                {isStreaming && !content && (
                                    <motion.span
                                        className="inline-block w-1.5 h-1.5 bg-amber-500/50 rounded-full ml-1"
                                        animate={{ opacity: [1, 0.3, 1] }}
                                        transition={{ duration: 1, repeat: Infinity }}
                                    />
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Final Answer */}
            <div className={`text-text-primary text-[15px] leading-relaxed max-w-[90%] transition-opacity duration-300 ${isStreaming && reasoning && !content ? 'opacity-40' : 'opacity-100'}`}>
                {content}
                {isStreaming && (
                    <motion.span
                        className="inline-block w-0.5 h-4 bg-text-secondary ml-0.5 align-middle"
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                    />
                )}
            </div>

            {/* Meta & Actions */}
            {!isStreaming && (
                <div className="flex items-center gap-4 mt-4">
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 text-[11px] font-bold text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        {copied ? 'COPIED' : 'COPY'}
                    </button>

                    {model && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
                            <Globe size={10} className="text-text-tertiary" />
                            <span className="text-[9px] font-black text-text-tertiary uppercase tracking-wider">
                                {provider ? `${provider} / ${model}` : model}
                            </span>
                        </div>
                    )}

                    {/* Sources Badge */}
                    {sources && sources.length > 0 && (
                        <div className="flex items-center gap-1.5 ml-auto">
                            {sources.map((source, i) => (
                                <div key={i} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest rounded border border-emerald-500/20">
                                    {source}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Smart Refinement Actions */}
            {!isStreaming && onRefine && (
                <div className="flex flex-wrap gap-2 mt-3 animated fadeInUp">
                    <button
                        onClick={() => onRefine("Make this response much shorter and more concise (natural spoken paragraphs).")}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-[10px] font-bold text-text-tertiary transition-all"
                    >
                        Shorten
                    </button>
                    <button
                        onClick={() => onRefine("Explain this in more depth with technical specifics.")}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-[10px] font-bold text-text-tertiary transition-all"
                    >
                        Deep Dive
                    </button>
                    <button
                        onClick={() => onRefine("Rephrase this to sound more professional and executive-level.")}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-[10px] font-bold text-text-tertiary transition-all"
                    >
                        Professional Tone
                    </button>
                </div>
            )}
        </motion.div>
    );
};

// ============================================
// Main Component
// ============================================

type ChatState = 'idle' | 'waiting_for_llm' | 'streaming_response' | 'error';

const GlobalChatOverlay: React.FC<GlobalChatOverlayProps> = ({
    isOpen,
    onClose,
    initialQuery = ''
}) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatState, setChatState] = useState<ChatState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [attachedImage, setAttachedImage] = useState<{ path: string; preview: string } | null>(null);
    const [llmConfig, setLlmConfig] = useState<{ provider: string; model: string; isAirGap?: boolean } | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatWindowRef = useRef<HTMLDivElement>(null);

    // Fetch config on open
    useEffect(() => {
        if (isOpen) {
            window.electronAPI?.getCurrentLlmConfig().then(config => {
                window.electronAPI?.getAirGapMode().then(airGap => {
                    setLlmConfig({ ...config, isAirGap: airGap });
                });
            });
        }
    }, [isOpen]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Submit initial query when overlay opens
    useEffect(() => {
        if (isOpen && initialQuery && messages.length === 0) {
            setTimeout(() => {
                submitQuestion(initialQuery);
            }, 100);
        }
    }, [isOpen, initialQuery]);

    // Listen for new queries from parent
    useEffect(() => {
        if (isOpen && initialQuery && messages.length > 0) {
            // This is a follow-up query
            submitQuestion(initialQuery);
        }
    }, [initialQuery]);

    // ESC key handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Listen for screenshots
    useEffect(() => {
        if (!window.electronAPI) return;

        const removeListener = window.electronAPI.onScreenshotTaken((data) => {
            console.log('[GlobalChat] Screenshot received:', data.path);
            setAttachedImage(data);
        });

        const removeAttachedListener = window.electronAPI.onScreenshotAttached((data) => {
            console.log('[GlobalChat] Screenshot attached manually:', data.path);
            setAttachedImage(data);
        });

        return () => {
            removeListener();
            removeAttachedListener();
        };
    }, []);

    // Click outside handler
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && query.trim()) {
            e.preventDefault();
            submitQuestion(query);
            setQuery('');
            setAttachedImage(null); // Clear image after submission
        }
    };

    // Submit question using global RAG
    const submitQuestion = useCallback(async (question: string) => {
        if (!question.trim() || chatState === 'waiting_for_llm' || chatState === 'streaming_response') return;

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: question
        };
        setMessages(prev => [...prev, userMessage]);
        setChatState('waiting_for_llm');
        setErrorMessage(null);

        const assistantMessageId = `assistant-${Date.now()}`;

        try {
            // Add typing indicator delay (200ms) - makes the AI feel "thoughtful"
            await new Promise(resolve => setTimeout(resolve, 200));

            // Create assistant message placeholder
            setMessages(prev => [...prev, {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                reasoning: '',
                isStreaming: true,
                model: llmConfig?.model,
                provider: llmConfig?.provider
            }]);

            // Set up RAG streaming listeners
            const tokenCleanup = window.electronAPI?.onRAGStreamChunk((data: { chunk: string }) => {
                setChatState('streaming_response');
                setMessages(prev => prev.map(msg => {
                    if (msg.id !== assistantMessageId) return msg;

                    let chunk = data.chunk;

                    // Handle Reasoning Prefix
                    if (chunk.startsWith('__THOUGHT__')) {
                        return { ...msg, reasoning: (msg.reasoning || '') + chunk.replace('__THOUGHT__', '') };
                    }

                    // Handle Sources Detection (End of stream usually)
                    if (chunk.includes('__SOURCES__:')) {
                        const parts = chunk.split('__SOURCES__:');
                        const sourcePart = parts[1].replace('[', '').replace(']', '').split(',').map(s => s.trim());
                        return {
                            ...msg,
                            content: msg.content + parts[0],
                            sources: [...(msg.sources || []), ...sourcePart]
                        };
                    }

                    return { ...msg, content: msg.content + chunk };
                }));
            });

            const doneCleanup = window.electronAPI?.onRAGStreamComplete(() => {
                setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                        ? { ...msg, isStreaming: false }
                        : msg
                ));
                setChatState('idle');
                tokenCleanup?.();
                doneCleanup?.();
                errorCleanup?.();
            });

            const errorCleanup = window.electronAPI?.onRAGStreamError((data: { error: string }) => {
                console.error('[GlobalChat] RAG stream error:', data.error);
                setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
                setErrorMessage("Couldn't get a response. Please try again.");
                setChatState('error');
                tokenCleanup?.();
                doneCleanup?.();
                errorCleanup?.();
            });

            // Use global RAG query
            const result = await window.electronAPI?.ragQueryGlobal(question);

            if (result?.fallback) {
                console.log("[GlobalChat] RAG unavailable, falling back to standard chat");
                // Cleanup RAG listeners
                tokenCleanup?.();
                doneCleanup?.();
                errorCleanup?.();

                // Setup fallback listeners (Standard Chat System)
                const oldTokenCleanup = window.electronAPI?.onGeminiStreamToken((token: string) => {
                    setChatState('streaming_response');
                    setMessages(prev => prev.map(msg => {
                        if (msg.id !== assistantMessageId) return msg;

                        // Handle Reasoning Prefix
                        if (token.startsWith('__THOUGHT__')) {
                            return { ...msg, reasoning: (msg.reasoning || '') + token.replace('__THOUGHT__', '') };
                        }

                        // Handle Sources Detection
                        if (token.includes('__SOURCES__:')) {
                            const parts = token.split('__SOURCES__:');
                            const sourcePart = parts[1].replace('[', '').replace(']', '').split(',').map(s => s.trim());
                            return {
                                ...msg,
                                content: msg.content + parts[0],
                                sources: [...(msg.sources || []), ...sourcePart]
                            };
                        }

                        return { ...msg, content: msg.content + token };
                    }));
                });

                const oldDoneCleanup = window.electronAPI?.onGeminiStreamDone(() => {
                    setMessages(prev => prev.map(msg =>
                        msg.id === assistantMessageId
                            ? { ...msg, isStreaming: false }
                            : msg
                    ));
                    setChatState('idle');
                    oldTokenCleanup?.();
                    oldDoneCleanup?.();
                    oldErrorCleanup?.();
                });

                const oldErrorCleanup = window.electronAPI?.onGeminiStreamError((error: string) => {
                    console.error('[GlobalChat] Stream error:', error);
                    setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
                    setErrorMessage("Couldn't get a response. Please check your settings.");
                    setChatState('error');
                    oldTokenCleanup?.();
                    oldDoneCleanup?.();
                    oldErrorCleanup?.();
                });

                // Call standard chat
                await window.electronAPI?.streamGeminiChat(question, attachedImage?.path, undefined, { skipSystemPrompt: false });
            }

        } catch (error) {
            console.error('[GlobalChat] Error:', error);
            setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
            setErrorMessage("Something went wrong. Please try again.");
            setChatState('error');
        }
    }, [chatState, llmConfig, attachedImage]);

    const handleRefine = useCallback((request: string) => {
        submitQuestion(request);
    }, [submitQuestion]);

    return (
        <AnimatePresence
            onExitComplete={() => {
                setChatState('idle');
                setMessages([]);
                setErrorMessage(null);
            }}
        >
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="absolute inset-0 z-40 flex flex-col justify-end"
                    onClick={handleBackdropClick}
                >
                    {/* Backdrop with blur */}
                    <motion.div
                        initial={{ backdropFilter: 'blur(0px)' }}
                        animate={{ backdropFilter: 'blur(8px)' }}
                        exit={{ backdropFilter: 'blur(0px)' }}
                        transition={{ duration: 0.16 }}
                        className="absolute inset-0 bg-black/40"
                    />

                    {/* Chat Window */}
                    <motion.div
                        ref={chatWindowRef}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "85vh", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                            height: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 },
                            opacity: { duration: 0.2 }
                        }}
                        className="relative mx-auto w-full max-w-[680px] mb-0 bg-bg-main/90 border-t border-x border-white/10 rounded-t-[32px] shadow-2xl overflow-hidden flex flex-col backdrop-blur-3xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                                    <img src={ghostWriterIcon} className="w-3.5 h-3.5 opacity-50" alt="logo" />
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-text-primary">Global Intelligence</span>
                                        {llmConfig?.isAirGap && (
                                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-tighter rounded border border-emerald-500/30">
                                                Full Privacy
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">
                                        {llmConfig ? `${llmConfig.provider} / ${llmConfig.model}` : 'Metadata Synthesis'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 transition-colors group"
                            >
                                <X size={16} className="text-text-tertiary group-hover:text-red-500 group-hover:drop-shadow-[0_0_8px_rgba(239,68,68,0.5)] transition-all duration-300" />
                            </button>
                        </div>

                        {/* Messages area - scrollable */}
                        <div className="flex-1 overflow-y-auto px-6 py-4 pb-32 custom-scrollbar">
                            {messages.map((msg) => (
                                msg.role === 'user'
                                    ? <UserMessage key={msg.id} content={msg.content} />
                                    : <AssistantMessage
                                        key={msg.id}
                                        content={msg.content}
                                        reasoning={msg.reasoning}
                                        sources={msg.sources}
                                        isStreaming={msg.isStreaming}
                                        model={msg.model}
                                        provider={msg.provider}
                                        onRefine={handleRefine}
                                    />
                            ))}

                            {chatState === 'waiting_for_llm' && <TypingIndicator />}

                            {errorMessage && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-[#FF6B6B] text-[13px] py-2"
                                >
                                    {errorMessage}
                                </motion.div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Floating Footer (Ask Bar) */}
                        <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-center z-50 pointer-events-none">
                            <div className="w-full max-w-[440px] relative group pointer-events-auto">
                                {/* Dark Glass Effect Input */}
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleInputKeyDown}
                                    placeholder={llmConfig?.isAirGap ? "Local semantic query..." : "Global semantic query..."}
                                    className="w-full pl-6 pr-14 py-4 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-2xl text-[14px] text-white placeholder-text-tertiary/40 focus:outline-none focus:border-white/20 transition-all duration-500 shadow-2xl font-medium"
                                />

                                {/* Image Preview */}
                                <AnimatePresence>
                                    {attachedImage && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.8, y: 10 }}
                                            className="absolute bottom-full mb-4 left-0 group/img"
                                        >
                                            <div className="relative p-1 bg-white/10 backdrop-blur-3xl border border-white/20 rounded-xl shadow-2xl overflow-hidden">
                                                <img
                                                    src={attachedImage.preview}
                                                    alt="Attached"
                                                    className="w-32 h-20 object-cover rounded-lg"
                                                />
                                                <button
                                                    onClick={() => setAttachedImage(null)}
                                                    className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
                                                >
                                                    <X size={10} />
                                                </button>
                                                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-500 text-[8px] font-black text-white uppercase tracking-widest rounded-md shadow-lg border border-emerald-400/50">
                                                    Attached
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button
                                    onClick={() => {
                                        if (query.trim()) {
                                            submitQuestion(query);
                                            setQuery('');
                                            setAttachedImage(null);
                                        }
                                    }}
                                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all duration-500 border border-white/10 ${query.trim() ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-white/5 text-text-tertiary hover:bg-white/10'
                                        }`}
                                >
                                    <ArrowUp size={18} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default GlobalChatOverlay;
