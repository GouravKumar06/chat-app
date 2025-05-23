
'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface ChatWindowProps {
  conversationId: string;
  userId: string;
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  conversation_id: string;
  sender: {
    email: string;
  };
  isEditing?: boolean;
}

export default function ChatWindow({ conversationId, userId }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const MESSAGES_PER_PAGE = 20;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async (pageNumber = 0, append = false) => {
    try {
      const from = pageNumber * MESSAGES_PER_PAGE;
      const to = from + MESSAGES_PER_PAGE - 1;
      
      const { data, error, count } = await supabase
        .from('messages')
        .select(`
          id, content, created_at, sender_id, conversation_id,
          sender:sender_id(email)
        `, { count: 'exact' })
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      
      const newMessages = (data?.reverse() || []).map((msg: any) => ({
        ...msg,
        sender: Array.isArray(msg.sender) ? msg.sender[0] : msg.sender
      }));

      if (append) {
        setMessages(prev => [...newMessages, ...prev]);
      } else {
        setMessages(newMessages);
        // Only scroll to bottom on initial load or refresh
        setTimeout(scrollToBottom, 100);
      }
      
      setHasMore(count !== null && from + newMessages.length < count);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setPage(0);
    setHasMore(true);
    loadMessages(0, false);

    // Subscribe to new messages
    const subscription = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as any;
          
          // Fetch sender info
          supabase
            .from('users')
            .select('email')
            .eq('id', newMsg.sender_id)
            .single()
            .then(({ data }) => {
              if (data) {
                // Create a properly typed Message object
                const messageWithSender: Message = {
                  id: newMsg.id,
                  content: newMsg.content,
                  created_at: newMsg.created_at,
                  sender_id: newMsg.sender_id,
                  conversation_id: newMsg.conversation_id,
                  sender: {
                    email: data.email
                  }
                };
                
                setMessages(prev => [...prev, messageWithSender]);
                setTimeout(scrollToBottom, 100);
              }
            });
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updatedMessage = payload.new as Message;
          setMessages(prev => 
            prev.map(msg => 
              msg.id === updatedMessage.id 
                ? { ...msg, content: updatedMessage.content, isEditing: false } 
                : msg
            )
          );
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const deletedMessage = payload.old as Message;
          setMessages(prev => prev.filter(msg => msg.id !== deletedMessage.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [conversationId]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container && container.scrollTop === 0 && hasMore && !loading) {
      setLoading(true);
      const nextPage = page + 1;
      setPage(nextPage);
      loadMessages(nextPage, true);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: newMessage
        });

      if (error) throw error;
      
      setNewMessage('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
    }
  };

  const startEditMessage = (message: Message) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === message.id 
          ? { ...msg, isEditing: true } 
          : { ...msg, isEditing: false }
      )
    );
    setEditMessage(message.content);
  };

  const cancelEditMessage = () => {
    setMessages(prev => prev.map(msg => ({ ...msg, isEditing: false })));
    setEditMessage('');
  };

  const saveEditMessage = async (messageId: string) => {
    if (!editMessage.trim()) return;

    try {
      const { error } = await supabase
        .from('messages')
        .update({ content: editMessage })
        .eq('id', messageId)
        .eq('sender_id', userId); // Ensure only the sender can edit

      if (error) throw error;
      
      setEditMessage('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to edit message');
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', userId); // Ensure only the sender can delete

      if (error) throw error;
      
      toast.success('Message deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete message');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-4 overflow-y-auto"
      >
        {loading && page === 0 ? (
          <div className="flex justify-center items-center h-full">
            <p>Loading messages...</p>
          </div>
        ) : (
          <>
            {loading && page > 0 && (
              <div className="text-center py-2">
                <p>Loading more messages...</p>
              </div>
            )}
            
            {messages.length === 0 ? (
              <div className="flex justify-center items-center h-full text-gray-500">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div 
                    key={message.id}
                    className={`flex ${message.sender_id === userId ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-xs md:max-w-md lg:max-w-lg rounded-lg p-3 ${
                        message.sender_id === userId 
                          ? 'bg-indigo-100 text-gray-800' 
                          : 'bg-gray-200 text-gray-800'
                      }`}
                    >
                      <div className="text-xs text-gray-500 mb-1">
                        {message.sender.email}
                      </div>
                      
                      {message.isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editMessage}
                            onChange={(e) => setEditMessage(e.target.value)}
                            className="w-full p-1 border border-gray-300 rounded"
                            autoFocus
                          />
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => saveEditMessage(message.id)}
                              className="text-xs bg-green-500 text-white px-2 py-1 rounded"
                            >
                              Save
                            </button>
                            <button 
                              onClick={cancelEditMessage}
                              className="text-xs bg-gray-500 text-white px-2 py-1 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="break-words">{message.content}</p>
                          <div className="mt-1 text-xs text-gray-500 flex justify-between items-center">
                            <span>
                              {new Date(message.created_at).toLocaleTimeString([], { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                            
                            {message.sender_id === userId && (
                              <div className="flex space-x-2">
                                <button 
                                  onClick={() => startEditMessage(message)}
                                  className="text-blue-500 hover:text-blue-700"
                                >
                                  Edit
                                </button>
                                <button 
                                  onClick={() => deleteMessage(message.id)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </>
        )}
      </div>
      
      <form onSubmit={sendMessage} className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}