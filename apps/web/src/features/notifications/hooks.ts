import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from './api';
import { notificationQueries } from './queries';

/** Opening an item, or "Mark all as read": the list and the badge follow. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationQueries.all() }),
  });
}

/** Activity from others on or off for one household (off also marks its unread activity read). */
export function useSetNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.setSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationQueries.all() }),
  });
}
