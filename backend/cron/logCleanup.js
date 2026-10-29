const db = require('../config/db');

async function cleanupOldLogs() {
    try {
        const days = 30;
        const [result1] = await db.execute(`DELETE FROM server_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
        const [result2] = await db.execute(`DELETE FROM visitor_sessions WHERE last_visit < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
        console.log(`[LogCleanup] Removed ${result1.affectedRows} server_logs, ${result2.affectedRows} visitor_sessions older than ${days} days`);
    } catch (err) {
        console.error('[LogCleanup] Error:', err.message);
    }
}

async function aggregateDailyTraffic() {
    try {
        await db.execute(`
            INSERT INTO daily_traffic (stat_date, unique_visitors, total_pageviews, total_requests, avg_response_time, error_count)
            SELECT 
                DATE(created_at) as stat_date,
                COUNT(DISTINCT ip) as unique_visitors,
                COUNT(*) as total_pageviews,
                COUNT(*) as total_requests,
                ROUND(AVG(response_time_ms)) as avg_response_time,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
            FROM server_logs
            WHERE is_bot = 0 AND DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            GROUP BY DATE(created_at)
            ON DUPLICATE KEY UPDATE
                unique_visitors = VALUES(unique_visitors),
                total_pageviews = VALUES(total_pageviews),
                total_requests = VALUES(total_requests),
                avg_response_time = VALUES(avg_response_time),
                error_count = VALUES(error_count)
        `);
        console.log('[LogCleanup] Daily traffic aggregated');
    } catch (err) {
        console.error('[LogCleanup] Aggregation error:', err.message);
    }
}

function startLogCleanupCron() {
    // Run cleanup daily at 00:05
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(0, 5, 0, 0);
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
    const delay = nextRun.getTime() - now.getTime();

    setTimeout(() => {
        cleanupOldLogs();
        aggregateDailyTraffic();
        setInterval(() => {
            cleanupOldLogs();
            aggregateDailyTraffic();
        }, 24 * 60 * 60 * 1000);
    }, delay);

    console.log(`[LogCleanup] Cron scheduled. First run at ${nextRun.toISOString()}`);
}

module.exports = { startLogCleanupCron, cleanupOldLogs, aggregateDailyTraffic };
