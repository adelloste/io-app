import { addDays, addMonths, addWeeks } from "date-fns";
import PushNotification from "react-native-push-notification";
import I18n from "../i18n";

// this tag gets associated to all scheduled notifications and is used to cancel them
// once the user logs in the first time
const FIRST_ACCESS_SPID_TAG: string = "local_notification_spid";

/*
 * Schedule a set of local notifications to remind the user to authenticate with spid
 */
export const scheduleLocalNotificationsAccessSpid = () => {
  const nowDate = new Date();
  // Configure all the dates to schedule local notifications
  const oneDayFromNow = addDays(nowDate, 1);
  const threeDaysFromPrev = addDays(oneDayFromNow, 3);
  const oneWeekFromPrev = addWeeks(threeDaysFromPrev, 1);
  const twoWeeksFromPrev = addWeeks(oneWeekFromPrev, 2);
  const oneMonthFromPrev = addMonths(twoWeeksFromPrev, 1);
  const twoMonthsFromPrev = addMonths(oneMonthFromPrev, 2);
  const sixMonthsFromPrev = addMonths(twoMonthsFromPrev, 6);
  const localNotificationDates: ReadonlyArray<Date> = [
    oneDayFromNow,
    threeDaysFromPrev,
    oneWeekFromPrev,
    twoWeeksFromPrev,
    oneMonthFromPrev,
    twoMonthsFromPrev,
    sixMonthsFromPrev
  ];

  PushNotification.checkPermissions(({ alert, badge, sound }) => {
    const notificationsAllowed = alert || badge || sound;

    if (!notificationsAllowed) {
      return;
    }

    localNotificationDates.forEach((scheduledDate: Date) =>
      PushNotification.localNotificationSchedule({
        title: I18n.t("global.localNotifications.spidLogin.title"),
        message: I18n.t("global.localNotifications.spidLogin.message"),
        date: scheduledDate,
        tag: FIRST_ACCESS_SPID_TAG,
        userInfo: { tag: FIRST_ACCESS_SPID_TAG }
      })
    );
  });
};

/*
 * Remove all the local notifications relating to authentication with spid
 */
export const removeScheduledNotificationAccessSpid = () => {
  /**
   * With the current library version (7.3.1) seems that cancelLocalNotifications doesn't work.
   *
   * eg. example code that doesn't work:
   *
   *   PushNotification.getScheduledLocalNotifications(x =>
   * x
   * .filter(notification => notification.data.tag === FIRST_ACCESS_SPID_TAG)
   * .forEach(firstAccessNotification => {
   *      PushNotification.cancelLocalNotifications({
   *        id: firstAccessNotification.id.toString()
   *      });
   *    })
   * );
   *
   * At the moment the "first access spid" is the only kind of scheduled notification and for this reason
   * it is safe to use PushNotification.cancelAllLocalNotifications();
   * If we add more scheduled notifications, we need to investigate why cancelLocalNotifications doesn't work
   */
  PushNotification.cancelAllLocalNotifications();
};
