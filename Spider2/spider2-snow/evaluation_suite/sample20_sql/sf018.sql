-- sf018: 推送通知参与度分析 (2023年6月1日 08:00-09:00 UTC)
-- 数据源: BRAZE_USER_EVENT_DEMO_DATASET_PUBLIC
-- 时间范围: Unix时间戳 1685606400 - 1685610000

WITH send_events AS (
    SELECT 
        APP_GROUP_ID,
        CAMPAIGN_ID,
        USER_ID,
        MESSAGE_VARIATION_ID,
        PLATFORM,
        COUNT(*) as push_notification_sends,
        COUNT(DISTINCT USER_ID) as unique_push_notification_sends
    FROM "USERS_MESSAGES_PUSHNOTIFICATION_SEND_VIEW"
    WHERE TIME BETWEEN 1685606400 AND 1685610000
    GROUP BY APP_GROUP_ID, CAMPAIGN_ID, USER_ID, MESSAGE_VARIATION_ID, PLATFORM
),
bounce_events AS (
    SELECT 
        APP_GROUP_ID,
        CAMPAIGN_ID,
        USER_ID,
        MESSAGE_VARIATION_ID,
        PLATFORM,
        COUNT(*) as push_notification_bounced,
        COUNT(DISTINCT USER_ID) as unique_push_notification_bounced
    FROM "USERS_MESSAGES_PUSHNOTIFICATION_BOUNCE_VIEW"
    WHERE TIME BETWEEN 1685606400 AND 1685610000
    GROUP BY APP_GROUP_ID, CAMPAIGN_ID, USER_ID, MESSAGE_VARIATION_ID, PLATFORM
),
open_events AS (
    SELECT 
        APP_GROUP_ID,
        CAMPAIGN_ID,
        USER_ID,
        MESSAGE_VARIATION_ID,
        PLATFORM,
        COUNT(*) as push_notification_open,
        COUNT(DISTINCT USER_ID) as unique_push_notification_opened
    FROM "USERS_MESSAGES_PUSHNOTIFICATION_OPEN_VIEW"
    WHERE TIME BETWEEN 1685606400 AND 1685610000
    GROUP BY APP_GROUP_ID, CAMPAIGN_ID, USER_ID, MESSAGE_VARIATION_ID, PLATFORM
),
influenced_open_events AS (
    SELECT 
        APP_GROUP_ID,
        CAMPAIGN_ID,
        USER_ID,
        MESSAGE_VARIATION_ID,
        PLATFORM,
        COUNT(*) as push_notification_influenced_open,
        COUNT(DISTINCT USER_ID) as unique_push_notification_influenced_open
    FROM "USERS_MESSAGES_PUSHNOTIFICATION_INFLUENCEDOPEN_VIEW"
    WHERE TIME BETWEEN 1685606400 AND 1685610000
    GROUP BY APP_GROUP_ID, CAMPAIGN_ID, USER_ID, MESSAGE_VARIATION_ID, PLATFORM
)
SELECT 
    COALESCE(s.APP_GROUP_ID, b.APP_GROUP_ID, o.APP_GROUP_ID, i.APP_GROUP_ID) as APP_GROUP_ID,
    COALESCE(s.CAMPAIGN_ID, b.CAMPAIGN_ID, o.CAMPAIGN_ID, i.CAMPAIGN_ID) as CAMPAIGN_ID,
    COALESCE(s.USER_ID, b.USER_ID, o.USER_ID, i.USER_ID) as USER_ID,
    COALESCE(s.MESSAGE_VARIATION_ID, b.MESSAGE_VARIATION_ID, o.MESSAGE_VARIATION_ID, i.MESSAGE_VARIATION_ID) as MESSAGE_VARIATION_ID,
    COALESCE(s.PLATFORM, b.PLATFORM, o.PLATFORM, i.PLATFORM) as PLATFORM,
    COALESCE(s.push_notification_sends, 0) as push_notification_sends,
    COALESCE(s.unique_push_notification_sends, 0) as unique_push_notification_sends,
    COALESCE(b.push_notification_bounced, 0) as push_notification_bounced,
    COALESCE(b.unique_push_notification_bounced, 0) as unique_push_notification_bounced,
    COALESCE(o.push_notification_open, 0) as push_notification_open,
    COALESCE(o.unique_push_notification_opened, 0) as unique_push_notification_opened,
    COALESCE(i.push_notification_influenced_open, 0) as push_notification_influenced_open,
    COALESCE(i.unique_push_notification_influenced_open, 0) as unique_push_notification_influenced_open
FROM send_events s
FULL OUTER JOIN bounce_events b ON 
    s.APP_GROUP_ID = b.APP_GROUP_ID AND
    s.CAMPAIGN_ID = b.CAMPAIGN_ID AND
    s.USER_ID = b.USER_ID AND
    s.MESSAGE_VARIATION_ID = b.MESSAGE_VARIATION_ID AND
    s.PLATFORM = b.PLATFORM
FULL OUTER JOIN open_events o ON 
    COALESCE(s.APP_GROUP_ID, b.APP_GROUP_ID) = o.APP_GROUP_ID AND
    COALESCE(s.CAMPAIGN_ID, b.CAMPAIGN_ID) = o.CAMPAIGN_ID AND
    COALESCE(s.USER_ID, b.USER_ID) = o.USER_ID AND
    COALESCE(s.MESSAGE_VARIATION_ID, b.MESSAGE_VARIATION_ID) = o.MESSAGE_VARIATION_ID AND
    COALESCE(s.PLATFORM, b.PLATFORM) = o.PLATFORM
FULL OUTER JOIN influenced_open_events i ON 
    COALESCE(s.APP_GROUP_ID, b.APP_GROUP_ID, o.APP_GROUP_ID) = i.APP_GROUP_ID AND
    COALESCE(s.CAMPAIGN_ID, b.CAMPAIGN_ID, o.CAMPAIGN_ID) = i.CAMPAIGN_ID AND
    COALESCE(s.USER_ID, b.USER_ID, o.USER_ID) = i.USER_ID AND
    COALESCE(s.MESSAGE_VARIATION_ID, b.MESSAGE_VARIATION_ID, o.MESSAGE_VARIATION_ID) = i.MESSAGE_VARIATION_ID AND
    COALESCE(s.PLATFORM, b.PLATFORM, o.PLATFORM) = i.PLATFORM
ORDER BY push_notification_sends DESC;