use crate::PosDb;
use crate::pos::error::{PosError, PosResult};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ContextItem {
    pub id: String,
    pub item_type: String,
    pub content: String,
    pub title: Option<String>,
    pub relevance_score: f32,
}

#[derive(sqlx::FromRow)]
struct GoalRow {
    text: String,
    #[allow(dead_code)]
    category: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ContextSearchRow {
    id: String,
    item_type: String,
    content: String,
    metadata: Option<serde_json::Value>,
    relevance: Option<f32>,
}

/// Get relevant knowledge items for a goal based on keywords and tags
#[tauri::command]
pub async fn get_context_for_goal(
    db: State<'_, PosDb>,
    goal_id: String,
) -> PosResult<Vec<ContextItem>> {
    let pool = &db.0;

    // Get the goal to extract keywords
    // Get the goal to extract keywords
    let goal = sqlx::query_as::<_, GoalRow>(
        "SELECT text, category FROM unified_goals WHERE id = $1"
    )
    .bind(goal_id.clone())
    .fetch_optional(pool)
    .await
    .map_err(|e| PosError::Database(format!("Failed to fetch goal: {}", e)))?
    .ok_or_else(|| PosError::NotFound(format!("Goal not found: {}", goal_id)))?;

    // Extract keywords from goal text (simple word splitting)
    let keywords: Vec<String> = goal
        .text
        .to_lowercase()
        .split_whitespace()
        .filter(|w| w.len() > 3) // Only words longer than 3 chars
        .take(5) // Limit to 5 keywords
        .map(|s| s.to_string())
        .collect();

    if keywords.is_empty() {
        return Ok(Vec::new());
    }

    // Build search query with OR conditions
    let search_pattern = keywords.join(" | ");

    // Query knowledge items with full-text search and relevance scoring
    // Query knowledge items with full-text search and relevance scoring
    let items = sqlx::query_as::<_, ContextSearchRow>(
        r#"
        SELECT 
            id,
            item_type,
            content,
            metadata,
            ts_rank(
                to_tsvector('english', content || ' ' || COALESCE((metadata->>'title')::text, '')),
                to_tsquery('english', $1)
            ) as relevance
        FROM knowledge_items
        WHERE 
            status IN ('Inbox', 'Planned')
            AND to_tsvector('english', content || ' ' || COALESCE((metadata->>'title')::text, '')) @@ to_tsquery('english', $1)
        ORDER BY relevance DESC
        LIMIT 5
        "#
    )
    .bind(search_pattern)
    .fetch_all(pool)
    .await
    .map_err(|e| PosError::Database(format!("Failed to search KB items: {}", e)))?;

    let context_items: Vec<ContextItem> = items
        .into_iter()
        .map(|row| {
            let title = row
                .metadata
                .and_then(|m| {
                    m.get("title").map(|v| v.as_str().unwrap_or("").to_string())
                });

            ContextItem {
                id: row.id,
                item_type: row.item_type,
                content: row.content,
                title,
                relevance_score: row.relevance.unwrap_or(0.0) as f32,
            }
        })
        .collect();

    Ok(context_items)
}
