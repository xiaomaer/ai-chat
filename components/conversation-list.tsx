import { MessageCircle } from 'lucide-react';
import type { Conversation } from '@/lib/conversations';

type Props = {
  conversations: Conversation[];
  activeId?: string;
  disabled: boolean;
  onSelect: (id: string) => void;
};

export function ConversationList({ conversations, activeId, disabled, onSelect }: Props) {
  return (
    <nav className="conversation-nav" aria-label="会话列表">
      <div className="sidebar-section-label">我的对话 <span>{String(conversations.length).padStart(2, '0')}</span></div>
      <ul className="conversation-items">
        {conversations.map(conversation => (
          <li key={conversation.id}>
            <button className="conversation-item" aria-label={`切换到：${conversation.title}`}
              aria-current={conversation.id === activeId ? 'true' : undefined}
              disabled={disabled} onClick={() => onSelect(conversation.id)}>
              <MessageCircle size={16} />
              <span className="conversation-item-content"><strong title={conversation.title}>{conversation.title}</strong>
                <small>{conversation.messages.length ? `${conversation.messages.length} 条消息` : '从一个新想法开始'}</small>
              </span>
              {conversation.id === activeId ? <span className="conversation-active-dot" aria-hidden="true" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
