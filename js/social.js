/**
 * CineVerse Social Graph & Interactions Module
 * Includes helpers for:
 * - Follow / Unfollow (#31)
 * - Recommendations (#34)
 * - Private Groups (#36)
 * - In-app notifications (#81)
 * - Online indicator (#84)
 */

import { getSupabase } from './supabase.js';
import { showToast } from './utils.js';

export const SocialManager = {
  // ─── SEGUIDORES / AMIGOS (#31) ─────────────────────────────────────────────
  async follow(followerId, followingId) {
    const supabase = await getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase.from('followers').insert({
        follower_id: followerId,
        following_id: followingId
      });
      if (error) throw error;

      // Crear notificación in-app (#81)
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', followerId).maybeSingle();
      await supabase.from('notifications').insert({
        user_id: followingId,
        type: 'follow',
        title: 'Nuevo Seguidor 🧑‍🤝‍🧑',
        body: `@${profile?.username || 'Alguien'} ha comenzado a seguirte.`,
        link: `publico.html?user=${profile?.username}`
      });

      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  async unfollow(followerId, followingId) {
    const supabase = await getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase.from('followers').delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  async isFollowing(followerId, followingId) {
    const supabase = await getSupabase();
    if (!supabase) return false;

    try {
      const { data } = await supabase.from('followers')
        .select('*')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();
      return !!data;
    } catch (e) {
      return false;
    }
  },

  async getSocialCounts(userId) {
    const supabase = await getSupabase();
    if (!supabase) return { followers: 0, following: 0 };

    try {
      const [fld, flg] = await Promise.all([
        supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
      ]);
      return { followers: fld.count || 0, following: flg.count || 0 };
    } catch (e) {
      return { followers: 0, following: 0 };
    }
  },

  // ─── RECOMENDACIONES (#34) ────────────────────────────────────────────────
  async sendRecommendation(senderId, recipientId, mediaId, mediaType, title, poster) {
    const supabase = await getSupabase();
    if (!supabase) return false;

    try {
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', senderId).maybeSingle();
      const { error } = await supabase.from('notifications').insert({
        user_id: recipientId,
        type: 'recommendation',
        title: 'Te recomendaron una película 🎬',
        body: `@${profile?.username || 'Un amigo'} te recomienda ver "${title}"`,
        link: `${mediaType}.html?id=${mediaId}`
      });
      if (error) throw error;
      showToast('¡Recomendación enviada!', 'success');
      return true;
    } catch (e) {
      console.error(e);
      showToast('No se pudo enviar la recomendación', 'error');
      return false;
    }
  },

  // ─── GRUPOS PRIVADOS (#36) ────────────────────────────────────────────────
  async createGroup(name, ownerId) {
    const supabase = await getSupabase();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase.from('groups').insert({
        name,
        owner_id: ownerId
      }).select().single();

      if (error) throw error;

      // Unir al creador automáticamente
      await supabase.from('group_members').insert({
        group_id: data.id,
        user_id: ownerId
      });

      return data;
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  async inviteMember(groupId, username) {
    const supabase = await getSupabase();
    if (!supabase) return false;

    try {
      // Buscar el perfil de forma case-insensitive
      const { data: profile } = await supabase.from('profiles').select('id').ilike('username', username).maybeSingle();
      if (!profile) {
        showToast('Usuario no encontrado', 'error');
        return false;
      }

      const { error } = await supabase.from('group_members').insert({
        group_id: groupId,
        user_id: profile.id
      });

      if (error) {
        if (error.code === '23505') showToast('El usuario ya pertenece a este grupo', 'warning');
        else throw error;
        return false;
      }

      // Notificación in-app
      const { data: group } = await supabase.from('groups').select('name').eq('id', groupId).maybeSingle();
      await supabase.from('notifications').insert({
        user_id: profile.id,
        type: 'group_invite',
        title: 'Invitación a grupo 👥',
        body: `Fuiste añadido al grupo "${group?.name || 'Privado'}"`,
        link: `grupos.html?id=${groupId}`
      });

      showToast('Miembro agregado', 'success');
      return true;
    } catch (e) {
      console.error(e);
      showToast('No se pudo invitar al miembro', 'error');
      return false;
    }
  },

  // ─── HEARTBEAT DE ESTADO ONLINE (#84) ─────────────────────────────────────
  async updateOnlineStatus(userId, isOnline) {
    const supabase = await getSupabase();
    if (!supabase) return;

    try {
      await supabase.from('profiles')
        .update({
          is_online: isOnline,
          last_seen: new Date().toISOString()
        })
        .eq('id', userId);
    } catch (e) {
      // Ignorar fallas silenciosamente
    }
  }
};
