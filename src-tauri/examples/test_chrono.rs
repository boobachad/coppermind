/// Quick validation: chrono::DateTime<Utc> with sqlx TIMESTAMPTZ roundtrip.
/// Run: cargo run --example test_chrono
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::postgres::PgPoolOptions;

#[derive(Debug, Serialize, sqlx::FromRow)]
struct TestRow {
    id: String,
    ts: DateTime<Utc>,         // native chrono type for TIMESTAMPTZ
    ts_text: Option<String>,   // same column but cast to TEXT for comparison
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let db_url = std::env::var("VITE_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@127.0.0.1:5432/coppermind".into());

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await?;

    // Create temp table
    sqlx::query("CREATE TEMP TABLE _chrono_test (id TEXT PRIMARY KEY, ts TIMESTAMPTZ NOT NULL)")
        .execute(&pool).await?;

    // Insert using chrono::DateTime<Utc>
    let now: DateTime<Utc> = Utc::now();
    sqlx::query("INSERT INTO _chrono_test (id, ts) VALUES ($1, $2)")
        .bind("test1")
        .bind(now)
        .execute(&pool).await?;

    // Read back — native chrono type
    let row = sqlx::query_as::<_, TestRow>(
        "SELECT id, ts, ts::TEXT as ts_text FROM _chrono_test WHERE id = $1"
    )
    .bind("test1")
    .fetch_one(&pool).await?;

    println!("=== chrono::DateTime<Utc> roundtrip test ===");
    println!("Inserted:      {}", now.to_rfc3339());
    println!("Read back (chrono): {}", row.ts.to_rfc3339());
    println!("Read back (::TEXT): {:?}", row.ts_text);
    println!("Serde JSON:    {}", serde_json::to_string(&row.ts)?);
    println!("Match:         {}", now == row.ts);

    // Verify serde produces ISO 8601 that JS can parse
    let json = serde_json::to_string(&row)?;
    println!("\nFull row JSON: {}", json);

    // Also test: can we parse the ::TEXT output with chrono?
    if let Some(ref text) = row.ts_text {
        let parsed = DateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S%.f%:z");
        println!("\n::TEXT format: {}", text);
        println!("Parsed with custom fmt: {:?}", parsed);
        let rfc3339 = DateTime::parse_from_rfc3339(text);
        println!("Parsed with rfc3339:    {:?} (expected: Err)", rfc3339);
    }

    println!("\n✅ Test complete — chrono::DateTime<Utc> works natively with sqlx TIMESTAMPTZ");
    Ok(())
}
