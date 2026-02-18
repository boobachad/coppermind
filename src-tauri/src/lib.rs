use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use rdev::{grab, Event, EventType, Key};
use sqlx::postgres::PgPoolOptions;

mod pos;
mod unified_goals;
mod knowledge_base;
mod monthly_goals;

pub mod github {
    pub use crate::pos::github::*;
}

/// Wrapper for PG pool stored in Tauri managed state
pub struct PosDb(pub sqlx::PgPool);

/// Wrapper for POS configuration stored in Tauri managed state
pub struct PosConfig(pub pos::config::PosConfig);

/// Double-tap threshold in milliseconds
const DOUBLE_TAP_MS: u64 = 300;

/// State for tracking shift key double-taps
struct ShiftState {
    last_left_release: Option<Instant>,
    last_right_release: Option<Instant>,
}

impl ShiftState {
    fn new() -> Self {
        Self {
            last_left_release: None,
            last_right_release: None,
        }
    }
}

/// Read the selection (Smart: Primary -> Clipboard fallback, prioritizing URLs)
#[tauri::command]
fn read_primary_selection() -> Result<String, String> {
    let (primary, clipboard) = if std::env::var("WAYLAND_DISPLAY").is_ok() {
        log::info!("Wayland: Reading both Primary and Clipboard");
        (read_wayland_primary().ok(), read_wayland_clipboard().ok())
    } else {
        log::info!("X11: Reading both Primary and Clipboard");
        (read_x11_primary().ok(), read_x11_clipboard().ok())
    };

    // Log raw contents for debugging
    log::info!("RAW Primary: {:?}", primary);
    log::info!("RAW Clipboard: {:?}", clipboard);

    // Simplified Logic: Always prefer active selection (Primary), fallback to Clipboard.
    // The Frontend determines if it's a URL or Text.

    // Priority 1: Primary has content (User selected text)
    if let Some(p) = primary {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
             log::info!("SmartCapture: Using Primary content (length: {}).", trimmed.len());
             return Ok(trimmed.to_string());
        }
    }

    // Priority 2: Clipboard has content (Fallback)
    if let Some(c) = clipboard {
        let trimmed = c.trim();
        if !trimmed.is_empty() {
             log::info!("SmartCapture: Primary empty, using Clipboard (length: {}).", trimmed.len());
             return Ok(trimmed.to_string());
        }
    }

    Err("No content found in Primary or Clipboard".to_string())
}

/// Read PRIMARY selection on Wayland using wl-clipboard-rs
fn read_wayland_primary() -> Result<String, String> {
    read_wayland_generic(wl_clipboard_rs::paste::ClipboardType::Primary)
}

/// Read REGULAR clipboard on Wayland using wl-clipboard-rs
fn read_wayland_clipboard() -> Result<String, String> {
    read_wayland_generic(wl_clipboard_rs::paste::ClipboardType::Regular)
}

fn read_wayland_generic(kind: wl_clipboard_rs::paste::ClipboardType) -> Result<String, String> {
    use wl_clipboard_rs::paste::{get_contents, MimeType, Seat};
    
    match get_contents(kind, Seat::Unspecified, MimeType::Text) {
        Ok((mut reader, _)) => {
            let mut content = String::new();
            match reader.read_to_string(&mut content) {
                Ok(_) => Ok(content.trim().to_string()),
                Err(e) => Err(e.to_string())
            }
        }
        Err(e) => Err(e.to_string())
    }
}

/// Read PRIMARY selection on X11
fn read_x11_primary() -> Result<String, String> {
    read_x11_generic(true)
}

/// Read CLIPBOARD selection on X11
fn read_x11_clipboard() -> Result<String, String> {
    read_x11_generic(false)
}

fn read_x11_generic(primary: bool) -> Result<String, String> {
    use x11_clipboard::Clipboard;
    
    let cb = Clipboard::new().map_err(|e| e.to_string())?;
    let atom = if primary { cb.getter.atoms.primary } else { cb.getter.atoms.clipboard };

    let val = cb.load(
        atom,
        cb.getter.atoms.utf8_string,
        cb.getter.atoms.property,
        Duration::from_secs(1)
    ).map_err(|e| e.to_string())?;
    
    String::from_utf8(val)
        .map(|s| s.trim().to_string())
        .map_err(|e| e.to_string())
}

/// Start the keyboard listener for double-shift detection using grab (works on Wayland)
fn start_keyboard_listener(app_handle: AppHandle) {
    let state = Arc::new(Mutex::new(ShiftState::new()));
    let double_tap_threshold = Duration::from_millis(DOUBLE_TAP_MS);
    
    thread::spawn(move || {
        let state = state.clone();
        let app = app_handle.clone();
        
        log::info!("Keyboard listener starting with grab (evdev)...");
        log::info!("Double-tap LeftShift = Question, RightShift = Answer");
        
        // Use grab() instead of listen() for Wayland support via evdev
        // Returns Some(event) to pass through, None to consume
        let result = grab(move |event: Event| -> Option<Event> {
            if let EventType::KeyRelease(key) = event.event_type {
                let now = Instant::now();
                let mut state = state.lock().unwrap();
                
                match key {
                    Key::ShiftLeft => {
                        // Check for double-tap left shift -> Question
                        if let Some(last) = state.last_left_release {
                            if now.duration_since(last) < double_tap_threshold {
                                // Double-tap detected!
                                if let Ok(content) = read_primary_selection() {
                                    if !content.is_empty() {
                                        let _ = app.emit("capture-content", serde_json::json!({
                                            "role": "question",
                                            "content": content
                                        }));
                                        log::info!("Captured question: {} chars", content.len());
                                    }
                                }
                                state.last_left_release = None;
                                return Some(event); // Pass through the event
                            }
                        }
                        state.last_left_release = Some(now);
                    }
                    Key::ShiftRight => {
                        // Check for double-tap right shift -> Answer
                        if let Some(last) = state.last_right_release {
                            if now.duration_since(last) < double_tap_threshold {
                                // Double-tap detected!
                                if let Ok(content) = read_primary_selection() {
                                    if !content.is_empty() {
                                        let _ = app.emit("capture-content", serde_json::json!({
                                            "role": "answer",
                                            "content": content
                                        }));
                                        log::info!("Captured answer: {} chars", content.len());
                                    }
                                }
                                state.last_right_release = None;
                                return Some(event); // Pass through the event
                            }
                        }
                        state.last_right_release = Some(now);
                    }
                    _ => {}
                }
            }
            
            Some(event) // Always pass through events (don't consume)
        });
        
        if let Err(e) = result {
            log::error!("Keyboard grab error: {:?}", e);
            log::error!("Make sure user is in 'input' group: sudo usermod -aG input $USER");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env from project root (coppermind/)
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let is_widget = std::env::var("WIDGET_MODE").is_ok();

            if !is_widget {
                app.handle().plugin(tauri_plugin_sql::Builder::default().build())?;
            }
            app.handle().plugin(tauri_plugin_clipboard_manager::init())?;
            app.handle().plugin(tauri_plugin_shell::init())?;
            
            // rdev::grab is an exclusive evdev grab — only one process can hold it.
            // Widget process must not grab, or it breaks double-shift in the main app.
            if !is_widget {
                start_keyboard_listener(app.handle().clone());
            }

            // ─── POS: Load and validate configuration ─────────────────
            log::info!("[POS] Step 1: Loading configuration from .env");
            let pos_config = match pos::config::PosConfig::from_env() {
                Ok(cfg) => {
                    log::info!("[POS Config] Loaded successfully");
                    log::info!("[POS Config] DB URL prefix: {}", &cfg.database_url[..20]);
                    cfg
                }
                Err(e) => {
                    log::error!("[POS Config] Validation failed: {}", e);
                    log::error!("[POS] POS features will be unavailable");
                    return Ok(());
                }
            };

            let db_url = pos_config.database_url.clone();
            let max_connections = pos_config.db_max_connections;
            let timeout_secs = pos_config.db_connection_timeout_secs;
            
            log::info!("[POS] Step 2: Managing PosConfig state");
            app.handle().manage(PosConfig(pos_config));
            log::info!("[POS] Step 2: PosConfig state managed successfully");

            // ─── POS: Initialize PostgreSQL connection pool ───────────
            log::info!("[POS] Step 3: Spawning async task for DB connection");
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                log::info!("[POS] Step 3a: Inside async spawn, attempting DB connection");
                
                // Retry connection with exponential backoff
                let pool_result = pos::retry::retry_db_operation(
                    || async {
                        log::info!("[POS] Attempting to connect to PostgreSQL...");
                        PgPoolOptions::new()
                            .max_connections(max_connections)
                            .acquire_timeout(Duration::from_secs(timeout_secs))
                            .connect(&db_url)
                            .await
                    },
                    3, // Max 3 attempts
                ).await;

                match pool_result {
                    Ok(pool) => {
                        log::info!("[POS] Step 3b: PostgreSQL connected, initializing tables");
                        
                        // Create POS tables with retry
                        let init_result = pos::retry::retry_db_operation(
                            || pos::db::init_pos_tables(&pool),
                            3,
                        ).await;

                        if let Err(e) = init_result {
                            log::error!("[POS] Failed to init tables after retries: {e}");
                            return;
                        }
                        
                        log::info!("[POS] Step 3c: Tables initialized, managing PosDb state");
                        
                        // Store pool in managed state
                        handle.manage(PosDb(pool));
                        
                        log::info!("[POS] Step 3d: PosDb state managed successfully");
                        log::info!("[POS] ✓ PostgreSQL pool ready - all commands should work now");
                    }
                    Err(e) => {
                        log::error!("[POS] Failed to connect to PostgreSQL after retries: {e}");
                        log::error!("[POS] POS features will be unavailable");
                    }
                }
            });
            
            log::info!("[POS] Step 4: Async spawn initiated, continuing with app setup");

            log::info!("[JOURNAL] Step 2: Async spawn initiated");
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_primary_selection,
            pos::activities::get_activities,
            pos::activities::get_activities_batch,
            pos::activities::create_activity,
            pos::activities::update_activity,
            pos::activities::patch_activity,
            pos::activities::get_activity_range,
            pos::goals::get_goals,
            pos::goals::create_goal,
            pos::goals::get_debt_goals,
            pos::goals::update_goal_metric,
            pos::submissions::get_submissions,
            pos::scrapers::leetcode::scrape_leetcode,
            pos::scrapers::codeforces::scrape_codeforces,
            pos::scrapers::github::scrape_github,
            pos::github::get_github_repositories,
            pos::github::get_github_user_stats,
            pos::config::get_pos_config,
            unified_goals::create_unified_goal,
            unified_goals::get_unified_goals,
            unified_goals::update_unified_goal,
            unified_goals::delete_unified_goal,
            unified_goals::toggle_unified_goal_completion,
            unified_goals::link_activity_to_unified_goal,
            knowledge_base::create_knowledge_item,
            knowledge_base::get_knowledge_items,
            knowledge_base::update_knowledge_item,
            knowledge_base::delete_knowledge_item,
            knowledge_base::create_knowledge_link,
            knowledge_base::get_knowledge_links,
            knowledge_base::check_knowledge_duplicates,
            monthly_goals::create_monthly_goal,
            monthly_goals::get_monthly_goals,
            monthly_goals::update_monthly_goal,
            monthly_goals::run_balancer_engine,
            monthly_goals::delete_monthly_goal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
