-- Migration Reference: Recurring Goals to Monthly Goals
-- Manual migration guide

SELECT 
    rg.id,
    rg.description,
    COUNT(g.id) as usage_count
FROM pos_recurring_goals rg
LEFT JOIN pos_goals g ON g.recurring_goal_id = rg.id
GROUP BY rg.id, rg.description
ORDER BY usage_count DESC;
