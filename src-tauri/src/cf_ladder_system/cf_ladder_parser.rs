// CF Ladder & Category HTML Parsers
// Extracted from cf_ladder_system.rs to keep files under 600 lines

use scraper::{Html, Selector, ElementRef};
use regex::Regex;

use crate::pos::error::{PosError, PosResult};
use super::cf_ladder_types::{ParsedLadder, ParsedProblem, ParsedCategory, ParsedCategoryProblem};

// ─── Helper Functions ───────────────────────────────────────────────

fn extract_rating_range(title: &str, description: Option<&str>) -> (Option<i32>, Option<i32>) {
    // Combine title and description for searching
    let search_text = format!("{} {}", title, description.unwrap_or(""));
    
    // Pattern 1: "< 1300" or "Rating < 1300"
    let re_less = Regex::new(r"(?:Rating\s*)?<\s*(\d+)").unwrap();
    if let Some(caps) = re_less.captures(&search_text) {
        if let Ok(max) = caps[1].parse::<i32>() {
            return (Some(0), Some(max - 1));
        }
    }
    
    // Pattern 2: "1300 <= Rating <= 1399" or "1300 <= Codeforces Rating <= 1399"
    let re_range = Regex::new(r"(\d+)\s*<=.*?<=\s*(\d+)").unwrap();
    if let Some(caps) = re_range.captures(&search_text) {
        if let (Ok(min), Ok(max)) = (caps[1].parse::<i32>(), caps[2].parse::<i32>()) {
            return (Some(min), Some(max));
        }
    }
    
    // Pattern 3: ">= 2200" or "Rating >= 2200"
    let re_greater = Regex::new(r"(?:Rating\s*)?>=\s*(\d+)").unwrap();
    if let Some(caps) = re_greater.captures(&search_text) {
        if let Ok(min) = caps[1].parse::<i32>() {
            return (Some(min), Some(9999));
        }
    }
    
    // Pattern 4: No rating range (Div-based ladders)
    (None, None)
}

fn extract_problem_id(url: &str, judge: &str) -> Option<String> {
    match judge {
        "Codeforces" => {
            // http://codeforces.com/problemset/problem/472/D -> 472D
            if url.contains("codeforces.com/problemset/problem/") {
                let parts: Vec<&str> = url.split('/').collect();
                if parts.len() >= 2 {
                    let contest_id = parts[parts.len() - 2];
                    let index = parts[parts.len() - 1];
                    return Some(format!("{}{}", contest_id, index));
                }
            }
        }
        "SPOJ" => {
            // http://www.spoj.com/problems/BITMAP/ -> BITMAP
            if url.contains("spoj.com/problems/") {
                let parts: Vec<&str> = url.split('/').collect();
                for part in parts {
                    if !part.is_empty() && part != "problems" && !part.contains("spoj.com") {
                        return Some(part.to_string());
                    }
                }
            }
        }
        "UVA" => {
            // Various UVA formats - extract number from URL
            if let Some(num) = url.split('/').last() {
                if !num.is_empty() {
                    return Some(format!("UVA{}", num));
                }
            }
        }
        _ => {}
    }
    None
}

// ─── Ladder Parser ──────────────────────────────────────────────────

pub fn parse_ladder_html(html: &str) -> PosResult<ParsedLadder> {
    let document = Html::parse_document(html);
    
    // Extract title
    let title_sel = Selector::parse("title").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let title = document.select(&title_sel)
        .next()
        .map(|el: ElementRef| el.text().collect::<String>())
        .unwrap_or_default()
        .trim()
        .to_string();
    
    // Extract description from table if exists
    let desc_sel = Selector::parse("table tr td[colspan]").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let description = document.select(&desc_sel)
        .find(|el: &ElementRef| {
            let text = el.text().collect::<String>();
            text.contains("Description")
        })
        .map(|el: ElementRef| {
            let text = el.text().collect::<String>();
            // Extract just the description part after "Description: "
            text.split("Description:")
                .nth(1)
                .unwrap_or("")
                .trim()
                .to_string()
        });
    
    // Extract ladder difficulty level
    let ladder_difficulty = document.select(&desc_sel)
        .find(|el: &ElementRef| {
            let text = el.text().collect::<String>();
            text.contains("Difficulty Level:")
        })
        .and_then(|el: ElementRef| {
            let text = el.text().collect::<String>();
            // Extract number after "Difficulty Level: "
            text.split("Difficulty Level:")
                .nth(1)
                .and_then(|s| s.trim().parse::<i32>().ok())
        });
    
    // Extract rating range from ladder name or description
    let (rating_min, rating_max) = extract_rating_range(&title, description.as_deref());
    
    // Parse problem table
    let table_sel = Selector::parse("table").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let row_sel = Selector::parse("tr").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let cell_sel = Selector::parse("td").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let link_sel = Selector::parse("a").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    
    let mut problems = Vec::new();
    
    for table in document.select(&table_sel) {
        let rows = table.select(&row_sel);
        for (idx, row) in rows.enumerate() {
            if idx == 0 { continue; } // Skip header
            
            let cells: Vec<ElementRef> = row.select(&cell_sel).collect();
            if cells.len() < 3 { continue; }
            
            // Column 1: Position/ID
            let position = cells[0].text().collect::<String>().trim().parse::<i32>().unwrap_or(idx as i32);
            
            // Column 2: Problem name + URL
            if let Some(link) = cells[1].select(&link_sel).next() {
                let name = link.text().collect::<String>().trim().to_string();
                let url = link.value().attr("href").unwrap_or("").to_string();
                
                // Column 3: Online Judge
                let judge = if cells.len() > 2 {
                    cells[2].text().collect::<String>().trim().to_string()
                } else {
                    "Codeforces".to_string()
                };
                
                // Column 4: Difficulty (if exists)
                let difficulty = if cells.len() > 3 {
                    cells[cells.len() - 1].text().collect::<String>().trim().parse::<i32>().ok()
                } else {
                    None
                };
                
                // Extract problem_id from URL
                let problem_id = extract_problem_id(&url, &judge).unwrap_or_else(|| format!("prob_{}", position));
                
                problems.push(ParsedProblem {
                    position,
                    problem_id,
                    name,
                    url,
                    judge,
                    difficulty,
                });
            }
        }
        
        // If we found problems, break (don't process other tables)
        if !problems.is_empty() {
            break;
        }
    }
    
    Ok(ParsedLadder {
        title,
        description,
        ladder_difficulty,
        rating_min,
        rating_max,
        problems,
    })
}

// ─── Category Parser ────────────────────────────────────────────────

pub fn parse_category_html(html: &str) -> PosResult<ParsedCategory> {
    let document = Html::parse_document(html);
    
    // Extract title (e.g., "A2OJ Category: Numerical_Integration")
    let title_sel = Selector::parse("title").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let raw_title = document.select(&title_sel)
        .next()
        .map(|el: ElementRef| el.text().collect::<String>())
        .unwrap_or_default()
        .trim()
        .to_string();
    
    let category_name = raw_title.replace("A2OJ Category:", "").trim().to_string();
    
    // Parse problem table
    let table_sel = Selector::parse("table").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let row_sel = Selector::parse("tr").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let cell_sel = Selector::parse("td").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let link_sel = Selector::parse("a").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    
    let mut problems = Vec::new();
    
    for table in document.select(&table_sel) {
        let rows = table.select(&row_sel);
        for (idx, row) in rows.enumerate() {
            if idx == 0 { continue; } // Skip header
            
            let cells: Vec<ElementRef> = row.select(&cell_sel).collect();
            // Category table has ~6 cols: Id, Name, Judge, Year, Contest, Difficulty
            if cells.len() < 3 { continue; }
            
            // Col 0: Position
            let position = cells[0].text().collect::<String>().trim().parse::<i32>().unwrap_or(idx as i32);
            
            // Col 1: Problem name + URL
            if let Some(link) = cells[1].select(&link_sel).next() {
                let name = link.text().collect::<String>().trim().to_string();
                let url = link.value().attr("href").unwrap_or("").to_string();
                
                // Col 2: Online Judge
                let judge = cells[2].text().collect::<String>().trim().to_string();
                
                // Col 3: Year (may be empty)
                let year_text = if cells.len() > 3 {
                    cells[3].text().collect::<String>().trim().to_string()
                } else {
                    String::new()
                };
                let year = if year_text.is_empty() { None } else { Some(year_text) };
                
                // Col 4: Contest (may be empty)
                let contest_text = if cells.len() > 4 {
                    cells[4].text().collect::<String>().trim().to_string()
                } else {
                    String::new()
                };
                let contest = if contest_text.is_empty() { None } else { Some(contest_text) };
                
                // Col 5: Difficulty (if exists)
                let difficulty = if cells.len() > 5 {
                    cells[5].text().collect::<String>().trim().parse::<i32>().ok()
                } else {
                    None
                };
                
                let problem_id = extract_problem_id(&url, &judge).unwrap_or_else(|| format!("cat_prob_{}", position));
                
                problems.push(ParsedCategoryProblem {
                    position,
                    problem_id,
                    name,
                    url,
                    judge,
                    year,
                    contest,
                    difficulty,
                });
            }
        }
    }
    
    Ok(ParsedCategory {
        name: category_name,
        problems,
    })
}
