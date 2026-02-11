use std::future::Future;
use std::time::Duration;

/// Retry a database operation with exponential backoff
/// 
/// Retries transient errors (connection issues, timeouts) up to max_attempts.
/// Non-transient errors (constraint violations, not found) fail immediately.
pub async fn retry_db_operation<F, Fut, T, E>(
    operation: F,
    max_attempts: u32,
) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let mut attempts = 0;
    let mut delay_ms = 100;

    loop {
        attempts += 1;
        
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                let error_msg = e.to_string().to_lowercase();
                
                // Check if error is transient (retryable)
                let is_transient = error_msg.contains("connection")
                    || error_msg.contains("timeout")
                    || error_msg.contains("pool")
                    || error_msg.contains("network")
                    || error_msg.contains("broken pipe");

                // Non-transient errors fail immediately
                if !is_transient {
                    log::debug!("[RETRY] Non-transient error, failing immediately: {}", e);
                    return Err(e);
                }

                // Max attempts reached
                if attempts >= max_attempts {
                    log::error!("[RETRY] Max attempts ({}) reached: {}", max_attempts, e);
                    return Err(e);
                }

                // Exponential backoff with jitter
                log::warn!("[RETRY] Attempt {}/{} failed: {}. Retrying in {}ms", 
                    attempts, max_attempts, e, delay_ms);
                
                std::thread::sleep(Duration::from_millis(delay_ms));
                delay_ms = (delay_ms * 2).min(5000); // Cap at 5 seconds
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_retry_succeeds_on_second_attempt() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let mut call_count = 0;
            
            let result = retry_db_operation(
                || async {
                    call_count += 1;
                    if call_count == 1 {
                        Err("connection timeout")
                    } else {
                        Ok(42)
                    }
                },
                3,
            ).await;

            assert_eq!(result, Ok(42));
            assert_eq!(call_count, 2);
        });
    }

    #[test]
    fn test_retry_fails_non_transient() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let mut call_count = 0;
            
            let result = retry_db_operation(
                || async {
                    call_count += 1;
                    Err("unique constraint violation")
                },
                3,
            ).await;

            assert_eq!(result, Err("unique constraint violation"));
            assert_eq!(call_count, 1); // Should not retry
        });
    }

    #[test]
    fn test_retry_exhausts_attempts() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let mut call_count = 0;
            
            let result = retry_db_operation(
                || async {
                    call_count += 1;
                    Err("connection refused")
                },
                3,
            ).await;

            assert_eq!(result, Err("connection refused"));
            assert_eq!(call_count, 3);
        });
    }
}
