import {
  markNotificationsReadInputSchema,
  type NotificationListResponse,
  notificationSettingsSchema,
  type NotificationSettingsResponse,
  type UnreadCountResponse,
} from '@splinance/shared';
import { Router } from 'express';
import { rateLimiter } from '../../middleware/rate-limit';
import { getAuth } from '../../middleware/require-auth';
import { householdScope } from '../households/scope';
import {
  getNotificationSettings,
  getUnreadCount,
  listNotifications,
  markRead,
  setNotificationSettings,
} from './notifications.service';

/** Mounted at /notifications (behind requireAuth): the signed-in person's bell. */
export function createNotificationsRouter() {
  const router = Router();
  const reads = rateLimiter(120, { perUser: true });

  router.get('/', async (req, res) => {
    const body: NotificationListResponse = await listNotifications(getAuth(req).userId);
    res.json(body);
  });

  // Polled by the web (on focus and every few minutes): cheap, one count.
  router.get('/unread-count', async (req, res) => {
    const body: UnreadCountResponse = { unread: await getUnreadCount(getAuth(req).userId) };
    res.json(body);
  });

  router.post('/read', reads, async (req, res) => {
    const input = markNotificationsReadInputSchema.parse(req.body);
    await markRead(getAuth(req).userId, input);
    res.status(204).end();
  });

  return router;
}

/** Mounted at /households/:id/notification-settings (behind requireAuth): the caller's own. */
export function createNotificationSettingsRouter() {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const body: NotificationSettingsResponse = {
      settings: await getNotificationSettings(householdScope(req)),
    };
    res.json(body);
  });

  router.put('/', rateLimiter(30, { perUser: true }), async (req, res) => {
    const scope = householdScope(req);
    const settings = notificationSettingsSchema.parse(req.body);
    await setNotificationSettings(scope, settings);
    const body: NotificationSettingsResponse = { settings };
    res.json(body);
  });

  return router;
}
