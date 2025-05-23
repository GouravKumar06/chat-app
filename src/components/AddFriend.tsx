
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface AddFriendProps {
  userId: string;
}

export default function AddFriend({ userId }: AddFriendProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
  
    try {
      // Check if user exists
      const { data: userExists, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();
  
      if (userError || !userExists) {
        toast.error('User not found');
        setLoading(false);
        return;
      }
  
      if (userExists.id === userId) {
        toast.error('You cannot add yourself');
        setLoading(false);
        return;
      }
  
      // Check if ANY request already exists between these users (regardless of status or direction)
      const { data: existingRequests, error: requestError } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .or(`sender_id.eq.${userExists.id},receiver_id.eq.${userExists.id}`);
  
      if (requestError) {
        console.error('Error checking existing requests:', requestError);
        throw requestError;
      }
  
      const existingRequest = existingRequests?.some(req => 
        (req.sender_id === userId && req.receiver_id === userExists.id) || 
        (req.sender_id === userExists.id && req.receiver_id === userId)
      );

      if(existingRequest) {
        toast.error('You already have a request with this user');
        setLoading(false);
        return;
      }
  
      // If no existing request, create a new one
      const { error: sendError } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: userId,
          receiver_id: userExists.id,
          status: 'pending'
        });
  
      if (sendError) {
        console.error('Error sending request:', sendError);
        throw sendError;
      }
      
      toast.success('Friend request sent!');
      setEmail('');
    } catch (error: any) {
      console.error('Send request error:', error);
      toast.error(error.message || 'Failed to send friend request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border-b border-gray-200">
      <form onSubmit={handleSendRequest} className="flex flex-col space-y-2">
        <input
          type="email"
          placeholder="Friend's email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Add Friend'}
        </button>
      </form>
    </div>
  );
}