// Retrospectives System - SPACE Framework Implementation
// Periodic surveys for qualitative progress tracking

use crate::PosDb;
use crate::pos::utils::gen_id;
use crate::pos::error::{PosError, PosResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgQueryResult;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Retrospective {
    pub id: String,
    pub period_type: String, // "weekly" | "monthly"
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub questions_data: serde_json::Value, // JSONB with all question answers
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRetrospectiveInput {
    pub period_type: String,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub questions_data: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct RetrospectiveStats {
    pub avg_energy: f64,
    pub avg_satisfaction: f64,
    pub total_deep_work_hours: f64,
    pub correlation: f64, // Deep work vs satisfaction
}

// Table creation query
pub async fn ensure_retrospectives_table(db: &PosDb) -> PosResult<PgQueryResult> {
    sqlx::query::<sqlx::Postgres>(
        r#"
        CREATE TABLE IF NOT EXISTS retrospectives (
            id TEXT PRIMARY KEY,
            period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
            period_start TIMESTAMPTZ NOT NULL,
            period_end TIMESTAMPTZ NOT NULL,
            questions_data JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to create retrospectives table: {}", e)))
}

pub async fn ensure_retrospectives_indexes(db: &PosDb) -> PosResult<()> {
    sqlx::query::<sqlx::Postgres>("CREATE INDEX IF NOT EXISTS idx_retrospectives_period_type ON retrospectives(period_type)")
        .execute(&db.0)
        .await
        .map_err(|e| PosError::Database(format!("Failed to create period_type index: {}", e)))?;

    sqlx::query::<sqlx::Postgres>("CREATE INDEX IF NOT EXISTS idx_retrospectives_period_start ON retrospectives(period_start)")
        .execute(&db.0)
        .await
        .map_err(|e| PosError::Database(format!("Failed to create period_start index: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn create_retrospective(
    db: State<'_, PosDb>,
    input: CreateRetrospectiveInput,
) -> PosResult<Retrospective> {
    // Validate period_type
    if input.period_type != "weekly" && input.period_type != "monthly" {
        return Err(PosError::InvalidInput(
            "period_type must be 'weekly' or 'monthly'".to_string(),
        ));
    }

    let id = gen_id(); // r = retrospective
    let now = Utc::now();

    let retrospective = sqlx::query_as::<sqlx::Postgres, Retrospective>(
        r#"
        INSERT INTO retrospectives (id, period_type, period_start, period_end, questions_data, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, period_type, period_start, period_end, questions_data, created_at
        "#,
    )
    .bind(&id)
    .bind(&input.period_type)
    .bind(&input.period_start)
    .bind(&input.period_end)
    .bind(&input.questions_data)
    .bind(&now)
    .fetch_one(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to create retrospective: {}", e)))?;

    Ok(retrospective)
}

#[tauri::command]
pub async fn get_retrospectives(
    db: State<'_, PosDb>,
    period_type: Option<String>,
    limit: Option<i64>,
) -> PosResult<Vec<Retrospective>> {
    let limit = limit.unwrap_or(50).min(100);

    let retrospectives: Vec<Retrospective> = if let Some(pt) = period_type {
        sqlx::query_as::<sqlx::Postgres, Retrospective>(
            r#"
            SELECT id, period_type, period_start, period_end, questions_data, created_at
            FROM retrospectives
            WHERE period_type = $1
            ORDER BY period_start DESC
            LIMIT $2
            "#,
        )
        .bind(&pt)
        .bind(limit)
        .fetch_all(&db.0)
        .await
    } else {
        sqlx::query_as::<sqlx::Postgres, Retrospective>(
            r#"
            SELECT id, period_type, period_start, period_end, questions_data, created_at
            FROM retrospectives
            ORDER BY period_start DESC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(&db.0)
        .await
    }
    .map_err(|e| PosError::Database(format!("Failed to fetch retrospectives: {}", e)))?;

    Ok(retrospectives)
}

#[tauri::command]
pub async fn get_retrospective_stats(
    db: State<'_, PosDb>,
    start_date: DateTime<Utc>,
    end_date: DateTime<Utc>,
) -> PosResult<RetrospectiveStats> {
    // Extract energy and satisfaction from questions_data JSONB
    // Expected format: { "energy": 7, "satisfaction": 8, "deep_work_hours": 25 }
    
    #[derive(sqlx::FromRow)]
    struct StatsRow {
        avg_energy: Option<f64>,
        avg_satisfaction: Option<f64>,
        total_deep_work: Option<f64>,
    }

    let result = sqlx::query_as::<_, StatsRow>(
        r#"
        SELECT 
            AVG((questions_data->>'energy')::float) as "avg_energy",
            AVG((questions_data->>'satisfaction')::float) as "avg_satisfaction",
            SUM((questions_data->>'deep_work_hours')::float) as "total_deep_work"
        FROM retrospectives
        WHERE period_start >= $1 AND period_end <= $2
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_one(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to calculate stats: {}", e)))?;

    // Calculate correlation between deep work and satisfaction
    // Simple correlation: if we have data
    let correlation = calculate_correlation(&db.0, start_date, end_date).await?;

    Ok(RetrospectiveStats {
        avg_energy: result.avg_energy.unwrap_or(0.0),
        avg_satisfaction: result.avg_satisfaction.unwrap_or(0.0),
        total_deep_work_hours: result.total_deep_work.unwrap_or(0.0),
        correlation,
    })
}

async fn calculate_correlation(
    pool: &sqlx::PgPool,
    start_date: DateTime<Utc>,
    end_date: DateTime<Utc>,
) -> PosResult<f64> {
    #[derive(sqlx::FromRow)]
    struct CorrelationRow {
        deep_work: Option<f64>,
        satisfaction: Option<f64>,
    }

    // Fetch pairs of deep_work_hours and satisfaction
    let pairs = sqlx::query_as::<_, CorrelationRow>(
        r#"
        SELECT 
            (questions_data->>'deep_work_hours')::float as "deep_work",
            (questions_data->>'satisfaction')::float as "satisfaction"
        FROM retrospectives
        WHERE period_start >= $1 AND period_end <= $2
        AND questions_data->>'deep_work_hours' IS NOT NULL
        AND questions_data->>'satisfaction' IS NOT NULL
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_all(pool)
    .await
    .map_err(|e| PosError::Database(format!("Failed to fetch correlation data: {}", e)))?;

    if pairs.len() < 2 {
        return Ok(0.0); // Not enough data
    }

    // Calculate Pearson correlation coefficient
    let n = pairs.len() as f64;
    let sum_x: f64 = pairs.iter().filter_map(|p| p.deep_work).sum();
    let sum_y: f64 = pairs.iter().filter_map(|p| p.satisfaction).sum();
    let sum_xy: f64 = pairs
        .iter()
        .filter_map(|p| Some(p.deep_work? * p.satisfaction?))
        .sum();
    let sum_x2: f64 = pairs
        .iter()
        .filter_map(|p| Some(p.deep_work? * p.deep_work?))
        .sum();
    let sum_y2: f64 = pairs
        .iter()
        .filter_map(|p| Some(p.satisfaction? * p.satisfaction?))
        .sum();

    let numerator = n * sum_xy - sum_x * sum_y;
    let denominator = ((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y)).sqrt();

    if denominator == 0.0 {
        Ok(0.0)
    } else {
        Ok(numerator / denominator)
    }
}

#[tauri::command]
pub async fn delete_retrospective(
    db: State<'_, PosDb>,
    retrospective_id: String,
) -> PosResult<bool> {
    let result: PgQueryResult = sqlx::query::<sqlx::Postgres>("DELETE FROM retrospectives WHERE id = $1")
        .bind(&retrospective_id)
        .execute(&db.0)
        .await
        .map_err(|e| PosError::Database(format!("Failed to delete retrospective: {}", e)))?;

    Ok(result.rows_affected() > 0)
}
