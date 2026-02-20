// ─── POS Scrapers Module ────────────────────────────────────────────
// Modular scraper architecture for competitive programming platforms.
// Each platform has its own module for maintainability.

pub mod leetcode;
pub mod codeforces;
pub mod github;

use serde::Serialize;

// ─── Common HTTP client setup ───────────────────────────────────────

pub(crate) fn build_http_client() -> reqwest::Client {
    use reqwest::header;
    let mut headers = header::HeaderMap::new();
    headers.insert("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7".parse().unwrap());
    headers.insert("Accept-Language", "en-US,en;q=0.9".parse().unwrap());
    headers.insert("Cache-Control", "max-age=0".parse().unwrap());
    headers.insert("Sec-Ch-Ua", "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"".parse().unwrap());
    headers.insert("Sec-Ch-Ua-Mobile", "?0".parse().unwrap());
    headers.insert("Sec-Ch-Ua-Platform", "\"Linux\"".parse().unwrap());
    headers.insert("Sec-Fetch-Dest", "document".parse().unwrap());
    headers.insert("Sec-Fetch-Mode", "navigate".parse().unwrap());
    headers.insert("Sec-Fetch-Site", "none".parse().unwrap());
    headers.insert("Sec-Fetch-User", "?1".parse().unwrap());
    headers.insert("Upgrade-Insecure-Requests", "1".parse().unwrap());

    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .default_headers(headers)
        .build()
        .unwrap_or_default()
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
