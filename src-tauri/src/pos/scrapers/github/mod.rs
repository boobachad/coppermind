// GitHub scraper modules
pub mod types;
pub mod fetcher;
pub mod db;

// Re-export main function for backward compatibility
pub use fetcher::scrape_github;
