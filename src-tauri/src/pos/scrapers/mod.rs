// ─── POS Scrapers Module ────────────────────────────────────────────
// Modular scraper architecture for competitive programming platforms.
// Each platform has its own module for maintainability.

pub mod leetcode;
pub mod codeforces;
pub mod github;

use serde::Serialize;

// ─── Common HTTP client setup ───────────────────────────────────────

pub(crate) fn build_http_client() -> reqwest::Client {
    reqwest::Client::new()
}

// ─── Common response types ──────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScraperResponse {
    pub platform: String,
    pub new_submissions: i32,
    pub total_submissions: i32,
    pub shadow_activities: i32,
}
