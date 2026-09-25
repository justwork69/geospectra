import React, { useEffect, useState } from 'react';
import { ArrowUp, MessageSquare } from 'lucide-react';
import { GlassPanel } from '@/components/common/GlassPanel';
import { postAnalystChat, type ChatMessage } from '@/hooks/useTiles';

interface AnalystChatPanelProps {
  tileId?: string;
  fromDate?: string;
  toDate?: string;
  enabled: boolean;
  seedBrief?: string;
}

const suggestions = ['Why did NDVI change?', 'Is this change significant?', 'Is SAR evidence available?', 'Summarize for review'];

export const AnalystChatPanel: React.FC<AnalystChatPanelProps> = ({ tileId, fromDate, toDate, enabled, seedBrief }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastAvailable, setLastAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setMessages([]);
    setLastAvailable(null);
  }, [tileId, fromDate, toDate]);

  useEffect(() => {
    if (enabled && seedBrief && messages.length === 0) {
      setMessages([{ role: 'assistant', content: seedBrief }]);
    }
  }, [enabled, seedBrief, messages.length]);

  const submit = async (question = input) => {
    const trimmed = question.trim();
    if (!enabled || !tileId || !fromDate || !toDate || !trimmed || isSending) return;
    const nextMessages = [...messages, { role: 'user' as const, content: trimmed }].slice(-30);
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);
    try {
      const response = await postAnalystChat(tileId, fromDate, toDate, trimmed, messages.slice(-6));
      setLastAvailable(response.available);
      setMessages([...nextMessages, { role: 'assistant' as const, content: response.reply }].slice(-30));
    } catch {
      setLastAvailable(false);
      setMessages([...nextMessages, { role: 'assistant' as const, content: 'Assistant temporarily unavailable — please retry.' }].slice(-30));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-text-secondary"><MessageSquare size={14} className="text-aurora-400" /> Qwen Analyst Assistant</div>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-mono uppercase ${lastAvailable === true ? 'border-aurora-400/30 text-aurora-300' : lastAvailable === false ? 'border-amber-400/30 text-amber-300' : 'border-white/[0.12] text-text-muted'}`}>{lastAvailable === true ? 'Available' : lastAvailable === false ? 'Unavailable' : 'Standby'}</span>
      </div>
      <div className="mt-4 h-64 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && <div className="flex h-full items-center justify-center text-center text-xs font-mono text-text-muted">Run an analysis, then ask the assistant about the evidence.</div>}
        {messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'ml-8 rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-sm text-text-primary' : 'text-sm text-text-secondary'}>{message.content}</div>)}
        {isSending && <div className="text-xs font-mono text-aurora-300">QWEN IS ANALYZING<span className="animate-pulse">...</span></div>}
      </div>
      {enabled && messages.length <= 1 && <div className="mt-4 flex flex-wrap gap-2">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => submit(suggestion)} disabled={isSending} className="rounded-full border border-white/[0.1] px-2.5 py-1.5 text-[10px] font-mono text-text-secondary transition hover:border-aurora-400/40 hover:text-text-primary disabled:opacity-40">{suggestion}</button>)}</div>}
      <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} disabled={!enabled || isSending} placeholder="Ask about the evidence" className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-space-950 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-aurora-400/50 disabled:opacity-40" />
        <button type="submit" aria-label="Send question" disabled={!enabled || isSending || !input.trim()} className="inline-flex items-center justify-center rounded-lg bg-aurora-400 p-2.5 text-space-950 disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp size={16} /></button>
      </form>
    </GlassPanel>
  );
};
