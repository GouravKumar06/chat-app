'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface FriendsListProps {
  userId: string;
  onSelectConversation: (conversationId: string) => void;
  selectedConversation: string | null;
}

interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  sender: { email: string };
  receiver: { email: string };
}

interface Participant {
  user_id: string;
  email: string;
}

interface Conversation {
  id: string;
  created_at: string;
  participants: Participant[];
}

export default function FriendsList({ userId, onSelectConversation, selectedConversation }: FriendsListProps) {
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFriendsAndRequests = async () => {
      setLoading(true);
      try {
        // Fetch pending friend requests where the current user is the receiver
        const { data: requests, error: requestsError } = await supabase
          .from('friend_requests')
          .select(`
            id, sender_id, receiver_id, status, created_at,
            sender:sender_id(email),
            receiver:receiver_id(email)
          `)
          .eq('receiver_id', userId)
          .eq('status', 'pending');

        if (requestsError) throw requestsError;

        setPendingRequests(
          (requests || []).map((req) => ({
            ...req,
            sender: Array.isArray(req.sender) ? req.sender[0] : req.sender,
            receiver: Array.isArray(req.receiver) ? req.receiver[0] : req.receiver,
          }))
        );

        // Fetch conversations where the user is a participant, and include participants info
        const { data: conversationsData, error: conversationsError } = await supabase
          .from('conversations')
          .select(`
            id,
            created_at,
            participants(
              user_id,
              users(email)
            )
          `)
          .eq('participants.user_id', userId);

        if (conversationsError) throw conversationsError;

        // Map the conversations and extract participant emails (other than current user)
        setConversations(
          (conversationsData || []).map((conv: any) => ({
            id: conv.id,
            created_at: conv.created_at,
            participants: (conv.participants || [])
              .filter((p: any) => !!p.users) // filter out null users
              .map((p: any) => ({
                user_id: p.user_id,
                email: p.users.email,
              })),
          }))
        );

      } catch (error: any) {
        toast.error(error.message || 'Failed to load friends');
      } finally {
        setLoading(false);
      }
    };

    fetchFriendsAndRequests();

    console.log("pending requests: ", pendingRequests);
    console.log("conversations: ", conversations);

    // Real-time subscription to friend requests targeting this user
    const requestsSubscription = supabase
      .channel('friend_requests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${userId}` },
        () => fetchFriendsAndRequests()
      )
      .subscribe();

    // Real-time subscription for conversations changes
    const conversationsSubscription = supabase
      .channel('conversations_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchFriendsAndRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsSubscription);
      supabase.removeChannel(conversationsSubscription);
    };
  }, [userId, selectedConversation]);

  const handleAcceptRequest = async (requestId: string) => {
    try {
      // Update request status to accepted
      const { data: request, error: updateError } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .select('sender_id, receiver_id')
        .single();

      if (updateError) throw updateError;

      // Create a new conversation
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({})
        .select('id')
        .single();

      if (conversationError) throw conversationError;

      // Add both sender and receiver as participants in the conversation
      const { error: participantsError } = await supabase
        .from('participants')
        .insert([
          { conversation_id: conversation.id, user_id: request.sender_id },
          { conversation_id: conversation.id, user_id: request.receiver_id }
        ]);

      if (participantsError) throw participantsError;

      toast.success('Friend request accepted');
      onSelectConversation(conversation.id);
    } catch (error: any) {
      toast.error(error.message || 'Failed to accept request');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await supabase
        .from('friend_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      toast.success('Friend request rejected');
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject request');
    }
  };

  if (loading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  console.log("selected conversation: ", selectedConversation);

  return (
    <div className="flex-1 overflow-y-auto">
      {pendingRequests.length > 0 && (
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-medium text-gray-900 mb-2">Friend Requests</h3>
          <ul className="space-y-2">
            {pendingRequests.map((request) => (
              <li key={request.id} className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm mb-2">{request.sender.email} wants to be your friend</p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleAcceptRequest(request.id)}
                    className="bg-green-500 text-white text-xs py-1 px-2 rounded"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request.id)}
                    className="bg-red-500 text-white text-xs py-1 px-2 rounded"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-4">
        <h3 className="font-medium text-gray-900 mb-2">Conversations</h3>
        {conversations.length === 0 ? (
          <p className="text-sm text-gray-500">No conversations yet</p>
        ) : (
          <ul className="space-y-1 text-black">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={`p-3 rounded-md cursor-pointer border  ${
                  selectedConversation === conversation.id ? 'bg-yellow-300 border-black ' : 'hover:bg-gray-100'
                }`}
              >
                {/* Show emails of other participants */}
                <p className="text-sm  font-medium">
                  {conversation.participants.map((p) => p.email).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
