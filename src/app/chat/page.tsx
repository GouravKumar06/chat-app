
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import FriendsList from '../../components/FriendsList';
import ChatWindow from '../../components/ChatWindow';
import AddFriend from '../../components/AddFriend';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const [user, setUser] = useState<any>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getSession();
      
      if (!data.session) {
        router.push('/auth/login');
        return;
      }
      
      setUser(data.session.user);
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/auth/login');
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Logged out successfully');
    router.push('/auth/login');
  };

  if (!user) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  return (
    <div className="flex h-screen text-black  bg-gray-100">
      <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold">Chats</h2>
          <button 
            onClick={handleLogout}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Logout
          </button>
        </div>
        <AddFriend userId={user.id} />
        <FriendsList 
          userId={user.id} 
          onSelectConversation={setSelectedConversation}
          selectedConversation={selectedConversation}
        />
      </div>
      <div className="flex-1">
        {selectedConversation ? (
          <ChatWindow 
            conversationId={selectedConversation} 
            userId={user.id} 
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
}