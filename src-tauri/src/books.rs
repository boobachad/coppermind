use crate::pos::error::{PosError, PosResult};
use crate::pos::utils::gen_id;
use crate::{PosDb};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tauri::State;

// ─── Data Structures ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct BookRow {
    pub id: String,
    pub isbn: Option<String>,
    pub title: String,
    pub authors: serde_json::Value,  // JSONB array
    pub number_of_pages: Option<i32>,
    pub publisher: Option<String>,
    pub publish_date: Option<String>,
    pub cover_url: Option<String>,
    pub metadata: Option<serde_json::Value>,  // Full API response
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBookRequest {
    pub isbn: Option<String>,
    pub title: String,
    pub authors: Vec<String>,
    pub number_of_pages: Option<i32>,
    pub publisher: Option<String>,
    pub publish_date: Option<String>,
    pub cover_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBookRequest {
    pub title: Option<String>,
    pub authors: Option<Vec<String>>,
    pub number_of_pages: Option<i32>,
    pub publisher: Option<String>,
    pub publish_date: Option<String>,
    pub cover_url: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BookMetadata {
    pub isbn: String,
    pub title: String,
    pub authors: Vec<String>,
    pub number_of_pages: Option<i32>,
    pub publisher: Option<String>,
    pub publish_date: Option<String>,
    pub cover_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BookReadingHistory {
    pub book: BookRow,
    pub activities: Vec<ActivitySummary>,
    pub total_pages_read: i32,
    pub total_reading_time_minutes: i64,
    pub first_read_date: Option<String>,
    pub last_read_date: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ActivitySummary {
    pub id: String,
    pub date: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub pages_read: Option<i32>,
}

// ─── Commands ───────────────────────────────────────────────────────────────

/// Fetch book metadata from Open Library API
#[tauri::command]
pub async fn fetch_book_by_isbn(isbn: String) -> PosResult<BookMetadata> {
    fetch_from_open_library(&isbn).await
}

/// Create or get existing book
#[tauri::command]
pub async fn create_or_get_book(
    db: State<'_, PosDb>,
    req: CreateBookRequest,
) -> PosResult<BookRow> {
    let pool = &db.0;
    
    // Check if book with ISBN already exists
    if let Some(ref isbn) = req.isbn {
        if let Some(existing) = get_book_by_isbn(pool, isbn).await? {
            return Ok(existing);
        }
    }
    
    create_book(pool, req).await
}

/// Update book metadata
#[tauri::command]
pub async fn update_book(
    db: State<'_, PosDb>,
    book_id: String,
    req: UpdateBookRequest,
) -> PosResult<BookRow> {
    let pool = &db.0;
    update_book_metadata(pool, &book_id, req).await
}

/// Get reading activities for a book
#[tauri::command]
pub async fn get_book_reading_history(
    db: State<'_, PosDb>,
    book_id: String,
) -> PosResult<BookReadingHistory> {
    let pool = &db.0;
    get_reading_history(pool, &book_id).await
}

// ─── Internal Functions ─────────────────────────────────────────────────────

async fn fetch_from_open_library(isbn: &str) -> PosResult<BookMetadata> {
    let url = format!("https://openlibrary.org/isbn/{}.json", isbn);
    let response: serde_json::Value = reqwest::get(&url)
        .await?
        .json()
        .await?;
    
    let title = response["title"]
        .as_str()
        .unwrap_or("Unknown")
        .to_string();
    
    let authors = response["authors"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a["name"].as_str())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    
    let number_of_pages = response["number_of_pages"].as_i64().map(|n| n as i32);
    
    let publisher = response["publishers"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|p| p.as_str())
        .map(String::from);
    
    let publish_date = response["publish_date"].as_str().map(String::from);
    
    let cover_url = response["covers"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|id| id.as_i64())
        .map(|id| format!("https://covers.openlibrary.org/b/id/{}-L.jpg", id));
    
    Ok(BookMetadata {
        isbn: isbn.to_string(),
        title,
        authors,
        number_of_pages,
        publisher,
        publish_date,
        cover_url,
    })
}

async fn get_book_by_isbn(pool: &PgPool, isbn: &str) -> PosResult<Option<BookRow>> {
    let book = sqlx::query_as::<_, BookRow>(
        "SELECT * FROM books WHERE isbn = $1"
    )
    .bind(isbn)
    .fetch_optional(pool)
    .await?;
    
    Ok(book)
}

async fn create_book(pool: &PgPool, req: CreateBookRequest) -> PosResult<BookRow> {
    let id = gen_id();
    let now = Utc::now();
    let authors_json = serde_json::to_value(&req.authors)
        .map_err(|e| PosError::InvalidInput(format!("Invalid authors array: {}", e)))?;
    
    let book = sqlx::query_as::<_, BookRow>(
        r#"
        INSERT INTO books (
            id, isbn, title, authors, number_of_pages, 
            publisher, publish_date, cover_url, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        "#
    )
    .bind(&id)
    .bind(&req.isbn)
    .bind(&req.title)
    .bind(&authors_json)
    .bind(&req.number_of_pages)
    .bind(&req.publisher)
    .bind(&req.publish_date)
    .bind(&req.cover_url)
    .bind(&now)
    .bind(&now)
    .fetch_one(pool)
    .await?;
    
    Ok(book)
}

async fn update_book_metadata(
    pool: &PgPool,
    book_id: &str,
    req: UpdateBookRequest,
) -> PosResult<BookRow> {
    let now = Utc::now();
    
    // Build dynamic update query
    let mut query = String::from("UPDATE books SET updated_at = $1");
    let mut param_count = 2;
    let mut params: Vec<String> = vec![];
    
    if let Some(title) = &req.title {
        query.push_str(&format!(", title = ${}", param_count));
        params.push(title.clone());
        param_count += 1;
    }
    
    if let Some(authors) = &req.authors {
        let authors_json = serde_json::to_value(authors)
            .map_err(|e| PosError::InvalidInput(format!("Invalid authors: {}", e)))?;
        query.push_str(&format!(", authors = ${}", param_count));
        params.push(authors_json.to_string());
        param_count += 1;
    }
    
    if let Some(pages) = req.number_of_pages {
        query.push_str(&format!(", number_of_pages = ${}", param_count));
        params.push(pages.to_string());
        param_count += 1;
    }
    
    if let Some(publisher) = &req.publisher {
        query.push_str(&format!(", publisher = ${}", param_count));
        params.push(publisher.clone());
        param_count += 1;
    }
    
    if let Some(publish_date) = &req.publish_date {
        query.push_str(&format!(", publish_date = ${}", param_count));
        params.push(publish_date.clone());
        param_count += 1;
    }
    
    if let Some(cover_url) = &req.cover_url {
        query.push_str(&format!(", cover_url = ${}", param_count));
        params.push(cover_url.clone());
        param_count += 1;
    }
    
    if let Some(metadata) = &req.metadata {
        query.push_str(&format!(", metadata = ${}", param_count));
        params.push(metadata.to_string());
        param_count += 1;
    }
    
    query.push_str(&format!(" WHERE id = ${} RETURNING *", param_count));
    
    // Execute with sqlx query builder
    let mut q = sqlx::query_as::<_, BookRow>(&query).bind(&now);
    
    for param in params {
        q = q.bind(param);
    }
    q = q.bind(book_id);
    
    let book = q.fetch_one(pool).await?;
    
    Ok(book)
}

async fn get_reading_history(pool: &PgPool, book_id: &str) -> PosResult<BookReadingHistory> {
    // Get book
    let book = sqlx::query_as::<_, BookRow>(
        "SELECT * FROM books WHERE id = $1"
    )
    .bind(book_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| PosError::NotFound(format!("Book not found: {}", book_id)))?;
    
    // Get activities
    let activities = sqlx::query_as::<_, ActivitySummary>(
        r#"
        SELECT id, date, start_time, end_time, pages_read
        FROM pos_activities
        WHERE book_id = $1
        ORDER BY start_time DESC
        "#
    )
    .bind(book_id)
    .fetch_all(pool)
    .await?;
    
    // Calculate aggregates
    let total_pages_read: i32 = activities
        .iter()
        .filter_map(|a| a.pages_read)
        .sum();
    
    let total_reading_time_minutes: i64 = activities
        .iter()
        .map(|a| (a.end_time - a.start_time).num_minutes())
        .sum();
    
    let first_read_date = activities.last().map(|a| a.date.clone());
    let last_read_date = activities.first().map(|a| a.date.clone());
    
    Ok(BookReadingHistory {
        book,
        activities,
        total_pages_read,
        total_reading_time_minutes,
        first_read_date,
        last_read_date,
    })
}
