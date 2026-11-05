import {
  type MarkNotificationsReadInput,
  notificationListResponseSchema,
  type NotificationSettings,
  notificationSettingsResponseSchema,
  unreadCountResponseSchema,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const settingsPath = (householdId: string) => `${householdPath(householdId)}/notification-settings`;

export const notificationsApi = {
  list: ({ signal }: { signal?: AbortSignal }) =>
    http.get('/notifications', notificationListResponseSchema, { signal }),
  unreadCount: async ({ signal }: { signal?: AbortSignal }) =>
    (await http.get('/notifications/unread-count', unreadCountResponseSchema, { signal })).unread,
  markRead: ({ input }: { input: MarkNotificationsReadInput }) =>
    http.post('/notifications/read', noContent, input),
  settings: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(settingsPath(householdId), notificationSettingsResponseSchema, { signal }))
      .settings,
  setSettings: async ({
    householdId,
    settings,
  }: {
    householdId: string;
    settings: NotificationSettings;
  }) =>
    (await http.put(settingsPath(householdId), notificationSettingsResponseSchema, settings))
      .settings,
};
